import { pgTable, text, serial, timestamp, integer, varchar, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Restaurants table
export const restaurants = pgTable("restaurants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  address: text("address"),
  phone: varchar("phone", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  emailIdx: uniqueIndex("restaurants_email_idx").on(table.email),
}));

// Orders table with restaurant reference
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  orderNumber: text("order_number").notNull(),
  address: text("address").notNull(),
  platform: text("platform").notNull(),
  status: text("status").notNull().default("cooking"), // cooking, packed, in-transit, delivered
  latitude: text("latitude"),
  longitude: text("longitude"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Delivered orders table with restaurant reference
export const deliveredOrders = pgTable("delivered_orders", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  orderNumber: text("order_number").notNull(),
  address: text("address").notNull(),
  platform: text("platform").notNull(),
  latitude: text("latitude"),
  longitude: text("longitude"),
  deliveredAt: timestamp("delivered_at").defaultNow().notNull(),
  originalOrderId: integer("original_order_id").notNull(),
});

// Relations
export const restaurantsRelations = relations(restaurants, ({ many }) => ({
  orders: many(orders),
  deliveredOrders: many(deliveredOrders),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [orders.restaurantId],
    references: [restaurants.id],
  }),
}));

export const deliveredOrdersRelations = relations(deliveredOrders, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [deliveredOrders.restaurantId],
    references: [restaurants.id],
  }),
}));

// Schemas
export const insertRestaurantSchema = createInsertSchema(restaurants).omit({
  id: true,
  createdAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
});

export const insertDeliveredOrderSchema = createInsertSchema(deliveredOrders).omit({
  id: true,
  deliveredAt: true,
});

// Login schema
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// Types
export type Restaurant = typeof restaurants.$inferSelect;
export type InsertRestaurant = z.infer<typeof insertRestaurantSchema>;
export type LoginCredentials = z.infer<typeof loginSchema>;

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertDeliveredOrder = z.infer<typeof insertDeliveredOrderSchema>;
export type DeliveredOrder = typeof deliveredOrders.$inferSelect;
