import {
  restaurants,
  orders,
  deliveredOrders,
  type Restaurant,
  type InsertRestaurant,
  type Order,
  type InsertOrder,
  type DeliveredOrder,
  type InsertDeliveredOrder,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte } from "drizzle-orm";
import bcrypt from "bcrypt";

export interface IStorage {
  // Restaurant operations
  getRestaurant(id: number): Promise<Restaurant | undefined>;
  getRestaurantByEmail(email: string): Promise<Restaurant | undefined>;
  createRestaurant(restaurant: InsertRestaurant): Promise<Restaurant>;
  verifyPassword(email: string, password: string): Promise<Restaurant | null>;
  
  // Order operations (restaurant-scoped)
  getOrders(restaurantId: number): Promise<Order[]>;
  getOrder(id: number, restaurantId: number): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrderStatus(id: number, status: string, restaurantId: number): Promise<Order | undefined>;
  deleteOrder(id: number, restaurantId: number): Promise<boolean>;
  getDeliveredOrders(restaurantId: number): Promise<DeliveredOrder[]>;
  getTodaysDeliveredOrders(restaurantId: number): Promise<DeliveredOrder[]>;
  markOrderAsDelivered(id: number, restaurantId: number): Promise<boolean>;
  clearOldDeliveredOrders(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Restaurant operations
  async getRestaurant(id: number): Promise<Restaurant | undefined> {
    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, id));
    return restaurant;
  }

  async getRestaurantByEmail(email: string): Promise<Restaurant | undefined> {
    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.email, email));
    return restaurant;
  }

  async createRestaurant(restaurantData: InsertRestaurant): Promise<Restaurant> {
    const hashedPassword = await bcrypt.hash(restaurantData.password, 10);
    
    const [restaurant] = await db
      .insert(restaurants)
      .values({
        ...restaurantData,
        password: hashedPassword,
      })
      .returning();
    
    return restaurant;
  }

  async verifyPassword(email: string, password: string): Promise<Restaurant | null> {
    const restaurant = await this.getRestaurantByEmail(email);
    if (!restaurant) return null;

    const isValid = await bcrypt.compare(password, restaurant.password);
    return isValid ? restaurant : null;
  }

  // Order operations (restaurant-scoped)
  async getOrders(restaurantId: number): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.restaurantId, restaurantId))
      .orderBy(orders.createdAt);
  }

  async getOrder(id: number, restaurantId: number): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.restaurantId, restaurantId)));
    return order;
  }

  async createOrder(orderData: InsertOrder): Promise<Order> {
    const [order] = await db
      .insert(orders)
      .values(orderData)
      .returning();
    return order;
  }

  async updateOrderStatus(id: number, status: string, restaurantId: number): Promise<Order | undefined> {
    const [order] = await db
      .update(orders)
      .set({ status })
      .where(and(eq(orders.id, id), eq(orders.restaurantId, restaurantId)))
      .returning();
    return order;
  }

  async deleteOrder(id: number, restaurantId: number): Promise<boolean> {
    const result = await db
      .delete(orders)
      .where(and(eq(orders.id, id), eq(orders.restaurantId, restaurantId)));
    return result.rowCount > 0;
  }

  async getDeliveredOrders(restaurantId: number): Promise<DeliveredOrder[]> {
    return await db
      .select()
      .from(deliveredOrders)
      .where(eq(deliveredOrders.restaurantId, restaurantId))
      .orderBy(deliveredOrders.deliveredAt);
  }

  async getTodaysDeliveredOrders(restaurantId: number): Promise<DeliveredOrder[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return await db
      .select()
      .from(deliveredOrders)
      .where(
        and(
          eq(deliveredOrders.restaurantId, restaurantId),
          gte(deliveredOrders.deliveredAt, today)
        )
      )
      .orderBy(deliveredOrders.deliveredAt);
  }

  async markOrderAsDelivered(id: number, restaurantId: number): Promise<boolean> {
    const order = await this.getOrder(id, restaurantId);
    if (!order) return false;

    // Move order to delivered orders
    await db.insert(deliveredOrders).values({
      restaurantId: order.restaurantId,
      orderNumber: order.orderNumber,
      address: order.address,
      platform: order.platform,
      latitude: order.latitude,
      longitude: order.longitude,
      originalOrderId: order.id,
    });

    // Delete from active orders
    await this.deleteOrder(id, restaurantId);
    return true;
  }

  async clearOldDeliveredOrders(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    await db
      .delete(deliveredOrders)
      .where(gte(deliveredOrders.deliveredAt, yesterday));
  }
}

export const storage = new DatabaseStorage();