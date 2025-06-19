import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  address: text("address").notNull(),
  platform: text("platform").notNull(),
  status: text("status").notNull().default("cooking"), // cooking, packed, in-transit, delivered
  latitude: text("latitude"),
  longitude: text("longitude"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const deliveredOrders = pgTable("delivered_orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  address: text("address").notNull(),
  platform: text("platform").notNull(),
  latitude: text("latitude"),
  longitude: text("longitude"),
  deliveredAt: timestamp("delivered_at").defaultNow().notNull(),
  originalOrderId: serial("original_order_id").notNull(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
});

export const insertDeliveredOrderSchema = createInsertSchema(deliveredOrders).omit({
  id: true,
  deliveredAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertDeliveredOrder = z.infer<typeof insertDeliveredOrderSchema>;
export type DeliveredOrder = typeof deliveredOrders.$inferSelect;
