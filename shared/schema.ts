export * from "./models/auth";
import { pgTable, text, serial, timestamp, integer, varchar, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Orders table
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  address: text("address").notNull(),
  platform: text("platform").notNull(),
  status: text("status").notNull().default("cooking"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Delivered orders table
export const deliveredOrders = pgTable("delivered_orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  address: text("address").notNull(),
  platform: text("platform").notNull(),
  latitude: text("latitude"),
  longitude: text("longitude"),
  deliveredAt: timestamp("delivered_at").defaultNow().notNull(),
  originalOrderId: integer("original_order_id").notNull(),
});

// ── New tables ────────────────────────────────────────────────────────────────

// Restaurants table
export const restaurants = pgTable("restaurants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Users table (app-level accounts; auth_provider_id stores the Replit user ID)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  authProviderId: varchar("auth_provider_id"),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Role enum for restaurant_users
export const restaurantRoleEnum = pgEnum("restaurant_role", [
  "owner",
  "manager",
  "employee",
  "driver",
]);

// Restaurant–user join table
export const restaurantUsers = pgTable("restaurant_users", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  restaurantId: integer("restaurant_id")
    .notNull()
    .references(() => restaurants.id),
  role: restaurantRoleEnum("role").notNull(),
});

// ── Insert schemas ────────────────────────────────────────────────────────────

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
});

export const insertDeliveredOrderSchema = createInsertSchema(deliveredOrders).omit({
  id: true,
  deliveredAt: true,
});

export const insertRestaurantSchema = createInsertSchema(restaurants).omit({
  id: true,
  createdAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertRestaurantUserSchema = createInsertSchema(restaurantUsers).omit({
  id: true,
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export type InsertDeliveredOrder = z.infer<typeof insertDeliveredOrderSchema>;
export type DeliveredOrder = typeof deliveredOrders.$inferSelect;

export type InsertRestaurant = z.infer<typeof insertRestaurantSchema>;
export type Restaurant = typeof restaurants.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type AppUser = typeof users.$inferSelect;

export type InsertRestaurantUser = z.infer<typeof insertRestaurantUserSchema>;
export type RestaurantUser = typeof restaurantUsers.$inferSelect;
