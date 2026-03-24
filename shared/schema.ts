import { pgTable, text, serial, timestamp, integer, varchar } from "drizzle-orm/pg-core";
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

// Schemas
export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
});

export const insertDeliveredOrderSchema = createInsertSchema(deliveredOrders).omit({
  id: true,
  deliveredAt: true,
});

// Types
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertDeliveredOrder = z.infer<typeof insertDeliveredOrderSchema>;
export type DeliveredOrder = typeof deliveredOrders.$inferSelect;
