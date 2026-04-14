import {
  orders,
  deliveredOrders,
  restaurants,
  users,
  restaurantUsers,
  driverSessions,
  type Order,
  type InsertOrder,
  type DeliveredOrder,
  type Restaurant,
  type AppUser,
  type RestaurantUser,
  type DriverSession,
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
  createRestaurantWithOwner(params: {
    restaurantName: string;
    slug: string;
    email: string;
    passwordHash: string;
  }): Promise<{ restaurant: Restaurant; user: AppUser }>;

  // Driver sessions
  upsertDriverSession(driverId: number, restaurantId: number): Promise<DriverSession>;
  deactivateDriverSession(driverId: number, restaurantId: number): Promise<void>;
  getActiveDrivers(restaurantId: number): Promise<{ driverId: number; email: string }[]>;
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

  async createRestaurantWithOwner(params: {
    restaurantName: string;
    slug: string;
    email: string;
    passwordHash: string;
  }): Promise<{ restaurant: Restaurant; user: AppUser }> {
    return await db.transaction(async (tx) => {
      const [restaurant] = await tx
        .insert(restaurants)
        .values({ name: params.restaurantName, slug: params.slug })
        .returning();

      const [user] = await tx
        .insert(users)
        .values({ email: params.email, passwordHash: params.passwordHash })
        .returning();

      await tx
        .insert(restaurantUsers)
        .values({ userId: user.id, restaurantId: restaurant.id, role: "owner" });

      return { restaurant, user };
    });
  }

  // ── Driver sessions ──────────────────────────────────────────────────────────

  async upsertDriverSession(driverId: number, restaurantId: number): Promise<DriverSession> {
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const [session] = await db
      .insert(driverSessions)
      .values({ driverId, restaurantId, date: today, isActive: true })
      .onConflictDoUpdate({
        target: [driverSessions.driverId, driverSessions.restaurantId, driverSessions.date],
        set: { isActive: true },
      })
      .returning();
    return session;
  }

  async deactivateDriverSession(driverId: number, restaurantId: number): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    await db
      .update(driverSessions)
      .set({ isActive: false })
      .where(
        and(
          eq(driverSessions.driverId, driverId),
          eq(driverSessions.restaurantId, restaurantId),
          eq(driverSessions.date, today)
        )
      );
  }

  async getActiveDrivers(restaurantId: number): Promise<{ driverId: number; email: string }[]> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await db
      .select({ driverId: driverSessions.driverId, email: users.email })
      .from(driverSessions)
      .innerJoin(users, eq(driverSessions.driverId, users.id))
      .where(
        and(
          eq(driverSessions.restaurantId, restaurantId),
          eq(driverSessions.date, today),
          eq(driverSessions.isActive, true)
        )
      );
    return rows;
  }
}

export const storage = new DatabaseStorage();
