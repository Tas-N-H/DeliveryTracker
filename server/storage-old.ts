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
import { eq, and } from "drizzle-orm";
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

export class MemStorage implements IStorage {
  private orders: Map<number, Order>;
  private deliveredOrders: Map<number, DeliveredOrder>;
  private currentId: number;
  private currentDeliveredId: number;

  constructor() {
    this.orders = new Map();
    this.deliveredOrders = new Map();
    this.currentId = 1;
    this.currentDeliveredId = 1;
    
    // Clear old delivered orders daily at midnight
    this.scheduleDaily();
  }

  private scheduleDaily() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.clearOldDeliveredOrders();
      // Schedule for next day
      setInterval(() => {
        this.clearOldDeliveredOrders();
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntilMidnight);
  }

  async getOrders(): Promise<Order[]> {
    return Array.from(this.orders.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getOrder(id: number): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const id = this.currentId++;
    const order: Order = {
      id,
      orderNumber: insertOrder.orderNumber,
      address: insertOrder.address,
      platform: insertOrder.platform,
      status: insertOrder.status || "pending",
      latitude: insertOrder.latitude ?? null,
      longitude: insertOrder.longitude ?? null,
      createdAt: new Date(),
    };
    this.orders.set(id, order);
    return order;
  }

  async updateOrderStatus(id: number, status: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    
    const updatedOrder = { ...order, status };
    this.orders.set(id, updatedOrder);
    return updatedOrder;
  }

  async deleteOrder(id: number): Promise<boolean> {
    return this.orders.delete(id);
  }

  async getDeliveredOrders(): Promise<DeliveredOrder[]> {
    return Array.from(this.deliveredOrders.values()).sort((a, b) => 
      new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime()
    );
  }

  async getTodaysDeliveredOrders(): Promise<DeliveredOrder[]> {
    const today = new Date().toDateString();
    return Array.from(this.deliveredOrders.values())
      .filter(order => new Date(order.deliveredAt).toDateString() === today)
      .sort((a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime());
  }

  async markOrderAsDelivered(id: number): Promise<boolean> {
    const order = this.orders.get(id);
    if (!order) return false;

    // Move order to delivered orders
    const deliveredOrder: DeliveredOrder = {
      id: this.currentDeliveredId++,
      orderNumber: order.orderNumber,
      address: order.address,
      platform: order.platform,
      latitude: order.latitude,
      longitude: order.longitude,
      deliveredAt: new Date(),
      originalOrderId: order.id,
    };

    this.deliveredOrders.set(deliveredOrder.id, deliveredOrder);
    this.orders.delete(id);
    return true;
  }

  async clearOldDeliveredOrders(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    const ordersToDelete: number[] = [];
    this.deliveredOrders.forEach((order, id) => {
      if (new Date(order.deliveredAt) < yesterday) {
        ordersToDelete.push(id);
      }
    });

    ordersToDelete.forEach(id => this.deliveredOrders.delete(id));
    console.log(`Cleared ${ordersToDelete.length} old delivered orders`);
  }
}

export const storage = new MemStorage();
