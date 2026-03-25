import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertOrderSchema } from "@shared/schema";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  // Get all active orders
  app.get("/api/orders", isAuthenticated, async (req, res) => {
    try {
      const orderList = await storage.getOrders();
      res.json(orderList);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Create new order
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

  // Update order status
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

  // Mark order as delivered
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

  // Get today's delivered orders count
  app.get("/api/orders/delivered/today", isAuthenticated, async (req, res) => {
    try {
      const deliveredList = await storage.getTodaysDeliveredOrders();
      res.json(deliveredList);
    } catch (error) {
      console.error("Error fetching delivered orders:", error);
      res.status(500).json({ error: "Failed to fetch delivered orders" });
    }
  });

  // Get all delivered orders
  app.get("/api/orders/delivered", isAuthenticated, async (req, res) => {
    try {
      const deliveredList = await storage.getDeliveredOrders();
      res.json(deliveredList);
    } catch (error) {
      console.error("Error fetching delivered orders:", error);
      res.status(500).json({ error: "Failed to fetch delivered orders" });
    }
  });

  // Geocode UK address
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
