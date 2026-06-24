import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertOrderSchema } from "@shared/schema";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import {
  requireRestaurantSession,
  requirePermission,
} from "./middleware/permissions";
import { z } from "zod";
import bcrypt from "bcrypt";

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  // ── Restaurant registration (open to anyone) ─────────────────────────────────

  app.post("/api/setup", async (req, res) => {
    try {
      const setupSchema = z.object({
        restaurantName: z.string().min(1),
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase with hyphens only"),
        email: z.string().email(),
        password: z.string().min(8),
      });

      const parsed = setupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.errors });
      }

      const { restaurantName, slug, email, password } = parsed.data;

      const passwordHash = await bcrypt.hash(password, 10);
      const { restaurant, user } = await storage.createRestaurantWithOwner({
        restaurantName,
        slug,
        email,
        passwordHash,
      });

      req.session.restaurantSession = {
        userId: user.id,
        role: "owner",
        restaurantId: restaurant.id,
        restaurantSlug: restaurant.slug,
      };

      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve()))
      );

      return res.status(201).json({
        restaurantSlug: restaurant.slug,
        userId: user.id,
        role: "owner",
      });
    } catch (error: any) {
      if (error?.code === "23505") {
        const detail: string = error.detail ?? "";
        if (detail.includes("slug")) {
          return res.status(409).json({ message: "This URL is already taken" });
        }
        if (detail.includes("email")) {
          return res.status(409).json({ message: "An account with that email already exists" });
        }
        return res.status(409).json({ message: "A duplicate record already exists" });
      }
      console.error("Setup error:", error);
      return res.status(500).json({ message: "Setup failed" });
    }
  });

  // ── Restaurant auth (public) ─────────────────────────────────────────────────

  app.post("/api/:restaurantSlug/login", async (req, res) => {
    const { restaurantSlug } = req.params;
    const { email, password } = req.body;

    const unauthorized = () =>
      res.status(401).json({ message: "Unauthorised access" });

    try {
      const restaurant = await storage.getRestaurantBySlug(restaurantSlug);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      if (!email || !password) return unauthorized();
      const user = await storage.getUserByEmail(email.trim().toLowerCase());
      if (!user) return unauthorized();

      const passwordValid = await bcrypt.compare(password, user.passwordHash);
      if (!passwordValid) return unauthorized();

      const membership = await storage.getRestaurantUser(user.id, restaurant.id);
      if (!membership) return unauthorized();

      req.session.restaurantSession = {
        userId: user.id,
        role: membership.role,
        restaurantId: restaurant.id,
        restaurantSlug: restaurant.slug,
      };

      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve()))
      );

      if (membership.role === "driver") {
        await storage.upsertDriverSession(user.id, restaurant.id);
      }

      return res.json({
        userId: user.id,
        role: membership.role,
        restaurantId: restaurant.id,
        restaurantSlug: restaurant.slug,
      });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/:restaurantSlug/info", async (req, res) => {
    try {
      const restaurant = await storage.getRestaurantBySlug(req.params.restaurantSlug);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }
      return res.json({ name: restaurant.name, slug: restaurant.slug });
    } catch (error) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── Restaurant auth (session required) ──────────────────────────────────────

  app.get("/api/:restaurantSlug/me",
    requireRestaurantSession,
    (req, res) => {
      res.json(req.session.restaurantSession);
    }
  );

  app.post("/api/:restaurantSlug/logout",
    requireRestaurantSession,
    async (req, res) => {
      const session = req.session.restaurantSession!;

      if (session.role === "driver") {
        await storage.deactivateDriverSession(session.userId, session.restaurantId);
      }

      req.session.restaurantSession = undefined;
      req.session.save(() => res.json({ ok: true }));
    }
  );

  // ── Geocode (restaurant-scoped) ──────────────────────────────────────────────

  app.post("/api/:restaurantSlug/geocode",
    requireRestaurantSession,
    async (req, res) => {
      try {
        const { address } = req.body;
        if (!address) {
          return res.status(400).json({ error: "Address is required" });
        }

        const postcodeMatch = address.match(/([A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][ABD-HJLNP-UW-Z]{2})/i);
        if (postcodeMatch) {
          const postcode = postcodeMatch[1].replace(/\s+/g, " ").trim();
          const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
          const d = await r.json();
          if (d.status === 200 && d.result) {
            return res.json({
              latitude: d.result.latitude.toString(),
              longitude: d.result.longitude.toString(),
            });
          }
        }

        const r = await fetch(`https://api.postcodes.io/postcodes?q=${encodeURIComponent(address)}`);
        const d = await r.json();
        if (d.status === 200 && d.result?.length > 0) {
          return res.json({
            latitude: d.result[0].latitude.toString(),
            longitude: d.result[0].longitude.toString(),
          });
        }

        res.json({ latitude: "51.5000", longitude: "-0.1200" });
      } catch (error) {
        console.error("Geocode error:", error);
        res.json({ latitude: "51.5000", longitude: "-0.1200" });
      }
    }
  );

  // ── Restaurant orders ────────────────────────────────────────────────────────
  // IMPORTANT: static sub-paths (delivered/today) must be registered BEFORE dynamic /:orderId paths

  // GET /api/:restaurantSlug/orders/delivered/today
  app.get("/api/:restaurantSlug/orders/delivered/today",
    requireRestaurantSession,
    requirePermission("view_orders"),
    async (req, res) => {
      try {
        const { restaurantId } = req.session.restaurantSession!;
        const delivered = await storage.getTodaysDeliveredRestaurantOrders(restaurantId);
        res.json(delivered);
      } catch (error) {
        console.error("Error fetching delivered orders:", error);
        res.status(500).json({ message: "Failed to fetch delivered orders" });
      }
    }
  );

  // GET /api/:restaurantSlug/orders/delivered  (full history — owner + manager)
  app.get("/api/:restaurantSlug/orders/delivered",
    requireRestaurantSession,
    requirePermission("view_analytics"),
    async (req, res) => {
      try {
        const { restaurantId } = req.session.restaurantSession!;
        const delivered = await storage.getRestaurantDeliveredOrders(restaurantId);
        res.json(delivered);
      } catch (error) {
        console.error("Error fetching delivered order history:", error);
        res.status(500).json({ message: "Failed to fetch delivered order history" });
      }
    }
  );

  // GET /api/:restaurantSlug/orders
  app.get("/api/:restaurantSlug/orders",
    requireRestaurantSession,
    requirePermission("view_orders"),
    async (req, res) => {
      try {
        const { restaurantId } = req.session.restaurantSession!;
        const orderList = await storage.getRestaurantOrders(restaurantId);
        res.json(orderList);
      } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ message: "Failed to fetch orders" });
      }
    }
  );

  // POST /api/:restaurantSlug/orders
  app.post("/api/:restaurantSlug/orders",
    requireRestaurantSession,
    requirePermission("manage_orders"),
    async (req, res) => {
      try {
        const { restaurantId } = req.session.restaurantSession!;
        const parsed = insertOrderSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid order data", errors: parsed.error.errors });
        }
        const order = await storage.createRestaurantOrder({
          ...parsed.data,
          restaurantId,
        });
        res.status(201).json(order);
      } catch (error) {
        console.error("Error creating order:", error);
        res.status(500).json({ message: "Failed to create order" });
      }
    }
  );

  // PATCH /api/:restaurantSlug/orders/:orderId/status
  app.patch("/api/:restaurantSlug/orders/:orderId/status",
    requireRestaurantSession,
    requirePermission("manage_orders"),
    async (req, res) => {
      try {
        const { restaurantId } = req.session.restaurantSession!;
        const orderId = parseInt(req.params.orderId);
        const { status } = req.body;

        if (!status || !["cooking", "packed", "in-transit"].includes(status)) {
          return res.status(400).json({ message: "Invalid status" });
        }

        const order = await storage.updateRestaurantOrderStatus(restaurantId, orderId, status);
        if (!order) return res.status(404).json({ message: "Order not found" });
        res.json(order);
      } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ message: "Failed to update order status" });
      }
    }
  );

  // DELETE /api/:restaurantSlug/orders/:orderId  (staff marks delivered)
  app.delete("/api/:restaurantSlug/orders/:orderId",
    requireRestaurantSession,
    requirePermission("manage_orders"),
    async (req, res) => {
      try {
        const { restaurantId } = req.session.restaurantSession!;
        const orderId = parseInt(req.params.orderId);
        const success = await storage.markRestaurantOrderDelivered(restaurantId, orderId);
        if (!success) return res.status(404).json({ message: "Order not found" });
        res.status(204).send();
      } catch (error) {
        console.error("Error marking order as delivered:", error);
        res.status(500).json({ message: "Failed to mark order as delivered" });
      }
    }
  );

  // POST /api/:restaurantSlug/orders/:orderId/assign
  app.post("/api/:restaurantSlug/orders/:orderId/assign",
    requireRestaurantSession,
    requirePermission("assign_order"),
    async (req, res) => {
      try {
        const { restaurantId } = req.session.restaurantSession!;
        const orderId = parseInt(req.params.orderId);
        const { driverId } = req.body;

        const driverIdNum = driverId == null ? null : parseInt(driverId);
        const order = await storage.assignOrderToDriver(restaurantId, orderId, driverIdNum);
        if (!order) return res.status(404).json({ message: "Order not found" });
        res.json(order);
      } catch (error) {
        console.error("Error assigning driver:", error);
        res.status(500).json({ message: "Failed to assign driver" });
      }
    }
  );

  // PATCH /api/:restaurantSlug/orders/:orderId/delivery-status  (driver marks delivered)
  app.patch("/api/:restaurantSlug/orders/:orderId/delivery-status",
    requireRestaurantSession,
    requirePermission("update_delivery_status"),
    async (req, res) => {
      try {
        const { restaurantId, userId } = req.session.restaurantSession!;
        const orderId = parseInt(req.params.orderId);

        // Verify order belongs to this restaurant and is assigned to this driver
        const order = await storage.getRestaurantOrder(restaurantId, orderId);
        if (!order) return res.status(404).json({ message: "Order not found" });
        if (order.assignedDriverId !== userId) {
          return res.status(403).json({ message: "This order is not assigned to you" });
        }

        const success = await storage.markRestaurantOrderDelivered(restaurantId, orderId);
        if (!success) return res.status(404).json({ message: "Order not found" });
        res.json({ ok: true });
      } catch (error) {
        console.error("Error marking order as delivered:", error);
        res.status(500).json({ message: "Failed to mark order as delivered" });
      }
    }
  );

  // GET /api/:restaurantSlug/driver/orders
  app.get("/api/:restaurantSlug/driver/orders",
    requireRestaurantSession,
    requirePermission("view_own_orders"),
    async (req, res) => {
      try {
        const { restaurantId, userId } = req.session.restaurantSession!;
        const driverOrders = await storage.getDriverOrders(restaurantId, userId);
        res.json(driverOrders);
      } catch (error) {
        console.error("Error fetching driver orders:", error);
        res.status(500).json({ message: "Failed to fetch driver orders" });
      }
    }
  );

  // ── Staff management ─────────────────────────────────────────────────────────

  // GET /api/:restaurantSlug/staff
  app.get("/api/:restaurantSlug/staff",
    requireRestaurantSession,
    requirePermission("manage_staff"),
    async (req, res) => {
      try {
        const { restaurantId } = req.session.restaurantSession!;
        const staff = await storage.getRestaurantStaff(restaurantId);
        res.json(staff);
      } catch (error) {
        console.error("Error fetching staff:", error);
        res.status(500).json({ message: "Failed to fetch staff" });
      }
    }
  );

  // POST /api/:restaurantSlug/staff
  app.post("/api/:restaurantSlug/staff",
    requireRestaurantSession,
    requirePermission("manage_staff"),
    async (req, res) => {
      try {
        const { restaurantId, role: requesterRole } = req.session.restaurantSession!;
        const staffSchema = z.object({
          name:     z.string().min(1, "Name is required").max(100),
          email:    z.string().email(),
          password: z.string().min(8, "Password must be at least 8 characters"),
          role:     z.enum(["manager", "employee", "driver"]),
        });
        const parsed = staffSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid input", errors: parsed.error.errors });
        }
        const { name, email, password, role } = parsed.data;

        // Managers cannot create manager-level accounts
        if (requesterRole === "manager" && role === "manager") {
          return res.status(403).json({ message: "Managers cannot create manager accounts" });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const member = await storage.addStaffMember(restaurantId, {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          passwordHash,
          role,
        });
        res.status(201).json(member);
      } catch (error: any) {
        if (error?.code === "ALREADY_MEMBER") {
          return res.status(409).json({ message: "This person is already a staff member" });
        }
        console.error("Error adding staff member:", error);
        res.status(500).json({ message: "Failed to add staff member" });
      }
    }
  );

  // PATCH /api/:restaurantSlug/staff/:userId/role
  app.patch("/api/:restaurantSlug/staff/:userId/role",
    requireRestaurantSession,
    requirePermission("manage_staff"),
    async (req, res) => {
      try {
        const { restaurantId, userId: sessionUserId, role: requesterRole } = req.session.restaurantSession!;
        const targetUserId = parseInt(req.params.userId);
        const roleSchema = z.object({ role: z.enum(["manager", "employee", "driver"]) });
        const parsed = roleSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid role" });
        }
        const { role: newRole } = parsed.data;

        // Fetch current role of target
        const staff = await storage.getRestaurantStaff(restaurantId);
        const target = staff.find(s => s.userId === targetUserId);
        if (!target) return res.status(404).json({ message: "Staff member not found" });

        // Owners cannot be demoted
        if (target.role === "owner") {
          return res.status(403).json({ message: "The owner's role cannot be changed" });
        }
        // Nobody can change their own role
        if (targetUserId === sessionUserId) {
          return res.status(403).json({ message: "You cannot change your own role" });
        }
        // Managers: can only change employee ↔ driver (not to/from manager)
        if (requesterRole === "manager") {
          if (target.role === "manager") {
            return res.status(403).json({ message: "Managers cannot change another manager's role" });
          }
          if (newRole === "manager") {
            return res.status(403).json({ message: "Managers cannot promote to manager" });
          }
        }

        const success = await storage.updateStaffRole(restaurantId, targetUserId, newRole);
        if (!success) return res.status(404).json({ message: "Staff member not found" });
        res.json({ userId: targetUserId, role: newRole });
      } catch (error) {
        console.error("Error updating staff role:", error);
        res.status(500).json({ message: "Failed to update role" });
      }
    }
  );

  // DELETE /api/:restaurantSlug/staff/:userId
  app.delete("/api/:restaurantSlug/staff/:userId",
    requireRestaurantSession,
    requirePermission("manage_staff"),
    async (req, res) => {
      try {
        const { restaurantId, userId: sessionUserId } = req.session.restaurantSession!;
        const targetUserId = parseInt(req.params.userId);

        // Prevent self-removal
        if (targetUserId === sessionUserId) {
          return res.status(400).json({ message: "You cannot remove yourself" });
        }

        // Prevent removing the owner
        const staff = await storage.getRestaurantStaff(restaurantId);
        const target = staff.find(s => s.userId === targetUserId);
        if (!target) return res.status(404).json({ message: "Staff member not found" });
        if (target.role === "owner") {
          return res.status(403).json({ message: "The owner cannot be removed" });
        }

        await storage.removeStaffMember(restaurantId, targetUserId);
        res.status(204).send();
      } catch (error) {
        console.error("Error removing staff member:", error);
        res.status(500).json({ message: "Failed to remove staff member" });
      }
    }
  );

  // ── Settings ──────────────────────────────────────────────────────────────────

  // PATCH /api/:restaurantSlug/settings/name  (owner only)
  app.patch("/api/:restaurantSlug/settings/name",
    requireRestaurantSession,
    requirePermission("manage_settings"),
    async (req, res) => {
      try {
        const { restaurantId } = req.session.restaurantSession!;
        const schema = z.object({ name: z.string().min(1, "Name is required").max(100) });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid input", errors: parsed.error.errors });
        }
        const restaurant = await storage.updateRestaurantName(restaurantId, parsed.data.name);
        res.json({ name: restaurant.name });
      } catch (error) {
        console.error("Error updating restaurant name:", error);
        res.status(500).json({ message: "Failed to update name" });
      }
    }
  );

  // view_analytics → owner, manager (placeholder)
  app.get("/api/:restaurantSlug/analytics",
    requireRestaurantSession,
    requirePermission("view_analytics"),
    async (_req, res) => {
      res.json({ ok: true, permission: "view_analytics" });
    }
  );

  // view_active_drivers → owner, manager, employee
  app.get("/api/:restaurantSlug/active-drivers",
    requireRestaurantSession,
    requirePermission("view_active_drivers"),
    async (req, res) => {
      try {
        const { restaurantId } = req.session.restaurantSession!;
        const drivers = await storage.getActiveDrivers(restaurantId);
        res.json(drivers);
      } catch (error) {
        console.error("Error fetching active drivers:", error);
        res.status(500).json({ message: "Failed to fetch active drivers" });
      }
    }
  );

  // ── Main app orders (Replit auth) ─────────────────────────────────────────────

  app.get("/api/orders", isAuthenticated, async (req, res) => {
    try {
      const orderList = await storage.getOrders();
      res.json(orderList);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.post("/api/orders", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertOrderSchema.parse(req.body);
      const order = await storage.createOrder(validatedData);
      res.status(201).json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid order data", details: error.errors });
      } else {
        console.error("Error creating order:", error);
        res.status(500).json({ error: "Failed to create order" });
      }
    }
  });

  app.patch("/api/orders/:id/status", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;

      if (!status || !["cooking", "packed", "in-transit", "delivered"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const order = await storage.updateOrderStatus(id, status);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      res.json(order);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ error: "Failed to update order status" });
    }
  });

  app.delete("/api/orders/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.markOrderAsDelivered(id);
      if (!success) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error marking order as delivered:", error);
      res.status(500).json({ error: "Failed to mark order as delivered" });
    }
  });

  app.get("/api/orders/delivered/today", isAuthenticated, async (req, res) => {
    try {
      const deliveredList = await storage.getTodaysDeliveredOrders();
      res.json(deliveredList);
    } catch (error) {
      console.error("Error fetching delivered orders:", error);
      res.status(500).json({ error: "Failed to fetch delivered orders" });
    }
  });

  app.get("/api/orders/delivered", isAuthenticated, async (req, res) => {
    try {
      const deliveredList = await storage.getDeliveredOrders();
      res.json(deliveredList);
    } catch (error) {
      console.error("Error fetching delivered orders:", error);
      res.status(500).json({ error: "Failed to fetch delivered orders" });
    }
  });

  app.post("/api/geocode", isAuthenticated, async (req, res) => {
    try {
      const { address } = req.body;
      if (!address) {
        return res.status(400).json({ error: "Address is required" });
      }

      const postcodeMatch = address.match(/([A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][ABD-HJLNP-UW-Z]{2})/i);
      if (postcodeMatch) {
        const postcode = postcodeMatch[1].replace(/\s+/g, " ").trim();
        const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
        const d = await r.json();
        if (d.status === 200 && d.result) {
          return res.json({
            latitude: d.result.latitude.toString(),
            longitude: d.result.longitude.toString(),
          });
        }
      }

      const r = await fetch(`https://api.postcodes.io/postcodes?q=${encodeURIComponent(address)}`);
      const d = await r.json();
      if (d.status === 200 && d.result?.length > 0) {
        return res.json({
          latitude: d.result[0].latitude.toString(),
          longitude: d.result[0].longitude.toString(),
        });
      }

      res.json({ latitude: "51.4000", longitude: "0.5500" });
    } catch (error) {
      console.error("Error geocoding address:", error);
      res.json({ latitude: "51.4000", longitude: "0.5500" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
