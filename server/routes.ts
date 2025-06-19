import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertOrderSchema, insertRestaurantSchema, loginSchema } from "@shared/schema";
import { authenticateToken, generateToken, type AuthenticatedRequest } from "./auth";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = insertRestaurantSchema.parse(req.body);
      
      // Check if restaurant already exists
      const existingRestaurant = await storage.getRestaurantByEmail(validatedData.email);
      if (existingRestaurant) {
        return res.status(400).json({ error: "Restaurant already exists with this email" });
      }

      const restaurant = await storage.createRestaurant(validatedData);
      const token = generateToken(restaurant.id);
      
      res.status(201).json({
        token,
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          email: restaurant.email,
          address: restaurant.address,
          phone: restaurant.phone,
        },
      });
    } catch (error) {
      console.error("Error creating restaurant:", error);
      res.status(500).json({ error: "Failed to create restaurant" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      
      const restaurant = await storage.verifyPassword(email, password);
      if (!restaurant) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const token = generateToken(restaurant.id);
      
      res.json({
        token,
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          email: restaurant.email,
          address: restaurant.address,
          phone: restaurant.phone,
        },
      });
    } catch (error) {
      console.error("Error logging in:", error);
      res.status(500).json({ error: "Failed to log in" });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const restaurant = req.restaurant;
      res.json({
        id: restaurant.id,
        name: restaurant.name,
        email: restaurant.email,
        address: restaurant.address,
        phone: restaurant.phone,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Protected order routes
  app.get("/api/orders", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const orders = await storage.getOrders(req.restaurantId!);
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

  // Mark order as delivered (moves to delivered orders)
  app.delete("/api/orders/:id", async (req, res) => {
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

  // Get today's delivered orders
  app.get("/api/orders/delivered/today", async (req, res) => {
    try {
      const deliveredOrders = await storage.getTodaysDeliveredOrders();
      res.json(deliveredOrders);
    } catch (error) {
      console.error("Error fetching delivered orders:", error);
      res.status(500).json({ error: "Failed to fetch delivered orders" });
    }
  });

  // Get all delivered orders
  app.get("/api/orders/delivered", async (req, res) => {
    try {
      const deliveredOrders = await storage.getDeliveredOrders();
      res.json(deliveredOrders);
    } catch (error) {
      console.error("Error fetching delivered orders:", error);
      res.status(500).json({ error: "Failed to fetch delivered orders" });
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
