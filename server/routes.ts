import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertOrderSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all orders
  app.get("/api/orders", async (req, res) => {
    try {
      const orders = await storage.getOrders();
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Create new order
  app.post("/api/orders", async (req, res) => {
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
  app.patch("/api/orders/:id/status", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      
      if (!status || !["pending", "in-transit", "delivered"].includes(status)) {
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

  // Delete order (mark as delivered)
  app.delete("/api/orders/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteOrder(id);
      
      if (!success) {
        return res.status(404).json({ error: "Order not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting order:", error);
      res.status(500).json({ error: "Failed to delete order" });
    }
  });

  // Geocode UK address
  app.post("/api/geocode", async (req, res) => {
    try {
      const { address } = req.body;
      
      if (!address) {
        return res.status(400).json({ error: "Address is required" });
      }

      // Extract postcode from address using regex
      const postcodeMatch = address.match(/([A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][ABD-HJLNP-UW-Z]{2})/i);
      
      if (postcodeMatch) {
        const postcode = postcodeMatch[1].replace(/\s+/g, ' ').trim();
        
        // Try direct postcode lookup first
        const postcodeResponse = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
        const postcodeData = await postcodeResponse.json();
        
        if (postcodeData.status === 200 && postcodeData.result) {
          return res.json({
            latitude: postcodeData.result.latitude.toString(),
            longitude: postcodeData.result.longitude.toString(),
          });
        }
      }

      // Fallback: Use general search with full address
      const response = await fetch(`https://api.postcodes.io/postcodes?q=${encodeURIComponent(address)}`);
      const data = await response.json();

      if (data.status === 200 && data.result && data.result.length > 0) {
        const result = data.result[0];
        res.json({
          latitude: result.latitude.toString(),
          longitude: result.longitude.toString(),
        });
      } else {
        // If still no results, provide a default Medway location
        console.log(`Could not geocode address: ${address}`);
        res.json({
          latitude: "51.4000",
          longitude: "0.5500",
        });
      }
    } catch (error) {
      console.error("Error geocoding address:", error);
      // Provide default Medway coordinates on error
      res.json({
        latitude: "51.4000",
        longitude: "0.5500",
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
