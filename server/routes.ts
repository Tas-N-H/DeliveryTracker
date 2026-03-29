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

  // ── Restaurant auth (public) ─────────────────────────────────────────────────

  // POST /api/:restaurantSlug/login
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

  // GET /api/:restaurantSlug/info — public: confirms the restaurant exists
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

  // GET /api/:restaurantSlug/me
  app.get("/api/:restaurantSlug/me",
    requireRestaurantSession,
    (req, res) => {
      res.json(req.session.restaurantSession);
    }
  );

  // POST /api/:restaurantSlug/logout
  app.post("/api/:restaurantSlug/logout",
    requireRestaurantSession,
    (req, res) => {
      req.session.restaurantSession = undefined;
      req.session.save(() => res.json({ ok: true }));
    }
  );

  // ── Permission-gated restaurant routes ───────────────────────────────────────
  // All routes below require:
  //   1. requireRestaurantSession  — valid session for this restaurant
  //   2. requirePermission(action) — role allowed to perform this action

  // view_orders → owner, manager, employee
  app.get("/api/:restaurantSlug/orders",
    requireRestaurantSession,
    requirePermission("view_orders"),
    async (_req, res) => {
      res.json({ ok: true, permission: "view_orders" });
    }
  );

  // assign_order → owner, manager, employee
  app.post("/api/:restaurantSlug/orders/:orderId/assign",
    requireRestaurantSession,
    requirePermission("assign_order"),
    async (_req, res) => {
      res.json({ ok: true, permission: "assign_order" });
    }
  );

  // view_own_orders → driver only
  app.get("/api/:restaurantSlug/driver/orders",
    requireRestaurantSession,
    requirePermission("view_own_orders"),
    async (req, res) => {
      const { userId } = req.session.restaurantSession!;
      res.json({ ok: true, permission: "view_own_orders", driverId: userId });
    }
  );

  // update_delivery_status → driver only
  app.patch("/api/:restaurantSlug/orders/:orderId/delivery-status",
    requireRestaurantSession,
    requirePermission("update_delivery_status"),
    async (_req, res) => {
      res.json({ ok: true, permission: "update_delivery_status" });
    }
  );

  // manage_staff → owner, manager
  app.post("/api/:restaurantSlug/staff",
    requireRestaurantSession,
    requirePermission("manage_staff"),
    async (_req, res) => {
      res.json({ ok: true, permission: "manage_staff" });
    }
  );

  app.delete("/api/:restaurantSlug/staff/:userId",
    requireRestaurantSession,
    requirePermission("manage_staff"),
    async (_req, res) => {
      res.json({ ok: true, permission: "manage_staff" });
    }
  );

  // view_analytics → owner, manager
  app.get("/api/:restaurantSlug/analytics",
    requireRestaurantSession,
    requirePermission("view_analytics"),
    async (_req, res) => {
      res.json({ ok: true, permission: "view_analytics" });
    }
  );

  // manage_settings → owner only
  app.put("/api/:restaurantSlug/settings",
    requireRestaurantSession,
    requirePermission("manage_settings"),
    async (_req, res) => {
      res.json({ ok: true, permission: "manage_settings" });
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
