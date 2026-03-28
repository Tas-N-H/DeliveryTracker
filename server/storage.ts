import {
  orders,
  deliveredOrders,
  restaurants,
  users,
  restaurantUsers,
  type Order,
  type InsertOrder,
  type DeliveredOrder,
  type Restaurant,
  type AppUser,
  type RestaurantUser,
} from "@shared/schema";
import { db } from "./db";
import { eq, gte, and } from "drizzle-orm";

export interface IStorage {
  // Orders
  getOrders(): Promise<Order[]>;
  getOrder(id: number): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrderStatus(id: number, status: string): Promise<Order | undefined>;
  deleteOrder(id: number): Promise<boolean>;
  getDeliveredOrders(): Promise<DeliveredOrder[]>;
  getTodaysDeliveredOrders(): Promise<DeliveredOrder[]>;
  markOrderAsDelivered(id: number): Promise<boolean>;

  // Restaurant auth
  getRestaurantBySlug(slug: string): Promise<Restaurant | undefined>;
  getUserByEmail(email: string): Promise<AppUser | undefined>;
  getRestaurantUser(userId: number, restaurantId: number): Promise<RestaurantUser | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getOrders(): Promise<Order[]> {
    return await db.select().from(orders).orderBy(orders.createdAt);
  }

  async getOrder(id: number): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async createOrder(orderData: InsertOrder): Promise<Order> {
    const [order] = await db.insert(orders).values(orderData).returning();
    return order;
  }

  async updateOrderStatus(id: number, status: string): Promise<Order | undefined> {
    const [order] = await db
      .update(orders)
      .set({ status })
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async deleteOrder(id: number): Promise<boolean> {
    const result = await db.delete(orders).where(eq(orders.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getDeliveredOrders(): Promise<DeliveredOrder[]> {
    return await db.select().from(deliveredOrders).orderBy(deliveredOrders.deliveredAt);
  }

  async getTodaysDeliveredOrders(): Promise<DeliveredOrder[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return await db
      .select()
      .from(deliveredOrders)
      .where(gte(deliveredOrders.deliveredAt, today))
      .orderBy(deliveredOrders.deliveredAt);
  }

  async markOrderAsDelivered(id: number): Promise<boolean> {
    const order = await this.getOrder(id);
    if (!order) return false;

    await db.insert(deliveredOrders).values({
      orderNumber: order.orderNumber,
      address: order.address,
      platform: order.platform,
      latitude: order.latitude,
      longitude: order.longitude,
      originalOrderId: order.id,
    });

    await this.deleteOrder(id);
    return true;
  }

  async getRestaurantBySlug(slug: string): Promise<Restaurant | undefined> {
    const [restaurant] = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.slug, slug));
    return restaurant;
  }

  async getUserByEmail(email: string): Promise<AppUser | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    return user;
  }

  async getRestaurantUser(userId: number, restaurantId: number): Promise<RestaurantUser | undefined> {
    const [ru] = await db
      .select()
      .from(restaurantUsers)
      .where(
        and(
          eq(restaurantUsers.userId, userId),
          eq(restaurantUsers.restaurantId, restaurantId)
        )
      );
    return ru;
  }
}

export const storage = new DatabaseStorage();
