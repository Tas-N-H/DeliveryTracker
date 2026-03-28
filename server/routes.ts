import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertOrderSchema } from "@shared/schema";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { z } from "zod";
import bcrypt from "bcrypt";

// ── Restaurant session middleware ─────────────────────────────────────────────

export const isRestaurantAuthenticated: RequestHandler = (req, res, next) => {
  if (!req.session.restaurantSession) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  // ── Restaurant auth ─────────────────────────────────────────────────────────

  // POST /api/:restaurantSlug/login
  app.post("/api/:restaurantSlug/login", async (req, res) => {
    const { restaurantSlug } = req.params;
    const { email, password } = req.body;

    const unauthorized = () =>
      res.status(401).json({ message: "Unauthorised access" });

    try {
      // 1. Look up restaurant
      const restaurant = await storage.getRestaurantBySlug(restaurantSlug);
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      // 2. Find user by email
      if (!email || !password) return unauthorized();
      const user = await storage.getUserByEmail(email.trim().toLowerCase());
      if (!user) return unauthorized();

      // 3. Verify password
      const passwordValid = await bcrypt.compare(password, user.passwordHash);
      if (!passwordValid) return unauthorized();

      // 4. Check restaurant membership
      const membership = await storage.getRestaurantUser(user.id, restaurant.id);
      if (!membership) return unauthorized();

      // 5. Create session
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

  // POST /api/:restaurantSlug/logout
  app.post("/api/:restaurantSlug/logout", (req, res) => {
    req.session.restaurantSession = undefined;
    req.session.save(() => res.json({ ok: true }));
  });

  // GET /api/:restaurantSlug/me — returns current session for this restaurant
  app.get("/api/:restaurantSlug/me", (req, res) => {
    const session = req.session.restaurantSession;
    if (!session || session.restaurantSlug !== req.params.restaurantSlug) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    return res.json(session);
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

  // ── Orders ──────────────────────────────────────────────────────────────────

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

  // ── Geocoding ───────────────────────────────────────────────────────────────

  app.post("/api/geocode", isAuthenticated, async (req, res) => {
    try {
      const { address } = req.body;

      if (!address) {
        return res.status(400).json({ error: "Address is required" });
      }

      const postcodeMatch = address.match(/([A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][ABD-HJLNP-UW-Z]{2})/i);

      if (postcodeMatch) {
        const postcode = postcodeMatch[1].replace(/\s+/g, ' ').trim();
        const postcodeResponse = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
        const postcodeData = await postcodeResponse.json();

        if (postcodeData.status === 200 && postcodeData.result) {
          return res.json({
            latitude: postcodeData.result.latitude.toString(),
            longitude: postcodeData.result.longitude.toString(),
          });
        }
      }

      const response = await fetch(`https://api.postcodes.io/postcodes?q=${encodeURIComponent(address)}`);
      const data = await response.json();

      if (data.status === 200 && data.result && data.result.length > 0) {
        const result = data.result[0];
        res.json({
          latitude: result.latitude.toString(),
          longitude: result.longitude.toString(),
        });
      } else {
        res.json({ latitude: "51.4000", longitude: "0.5500" });
      }
    } catch (error) {
      console.error("Error geocoding address:", error);
      res.json({ latitude: "51.4000", longitude: "0.5500" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
