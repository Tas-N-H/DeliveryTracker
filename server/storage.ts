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

// ── Staff code generation ────────────────────────────────────────────────────

function slugToPrefix(slug: string): string {
  return slug
    .split("-")
    .map((w) => w[0])
    .filter((c): c is string => !!c && /[a-zA-Z]/.test(c))
    .join("")
    .toUpperCase();
}

const ROLE_ABBR: Record<string, string> = {
  owner: "OWN",
  manager: "MGR",
  employee: "EMP",
  driver: "DRV",
};

async function nextStaffCode(
  restaurantId: number,
  slug: string,
  role: string,
): Promise<string> {
  const prefix    = slugToPrefix(slug);
  const roleAbbr  = ROLE_ABBR[role] ?? role.toUpperCase().slice(0, 3);
  const codePrefix = `${prefix}-${roleAbbr}-`;

  const existing = await db
    .select({ staffCode: restaurantUsers.staffCode })
    .from(restaurantUsers)
    .where(eq(restaurantUsers.restaurantId, restaurantId));

  let maxSeq = 0;
  for (const row of existing) {
    const code = row.staffCode;
    if (code?.startsWith(codePrefix)) {
      const seq = parseInt(code.slice(codePrefix.length), 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  return `${codePrefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

export interface IStorage {
  // Orders (main app – Replit auth)
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
  getActiveDrivers(restaurantId: number): Promise<{ driverId: number; name: string | null; email: string }[]>;

  // Restaurant-scoped orders
  getRestaurantOrders(restaurantId: number): Promise<Order[]>;
  getRestaurantOrder(restaurantId: number, orderId: number): Promise<Order | undefined>;
  createRestaurantOrder(data: InsertOrder & { restaurantId: number }): Promise<Order>;
  updateRestaurantOrderStatus(restaurantId: number, orderId: number, status: string): Promise<Order | undefined>;
  assignOrderToDriver(restaurantId: number, orderId: number, driverId: number | null): Promise<Order | undefined>;
  markRestaurantOrderDelivered(restaurantId: number, orderId: number): Promise<boolean>;
  getTodaysDeliveredRestaurantOrders(restaurantId: number): Promise<DeliveredOrder[]>;
  getRestaurantDeliveredOrders(restaurantId: number): Promise<(DeliveredOrder & { driverName: string | null; driverEmail: string | null })[]>;
  getDriverOrders(restaurantId: number, driverId: number): Promise<Order[]>;

  // Staff management
  getRestaurantStaff(restaurantId: number): Promise<{ userId: number; staffCode: string | null; name: string | null; email: string; role: string; createdAt: Date }[]>;
  addStaffMember(restaurantId: number, params: { name: string; email: string; passwordHash: string; role: string }): Promise<{ userId: number; staffCode: string | null; name: string | null; email: string; role: string; createdAt: Date }>;
  removeStaffMember(restaurantId: number, userId: number): Promise<boolean>;
  updateStaffRole(restaurantId: number, userId: number, role: string): Promise<boolean>;

  // Settings
  updateRestaurantName(restaurantId: number, name: string): Promise<Restaurant>;
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
    const today = new Date().toISOString().slice(0, 10);
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

  async getActiveDrivers(restaurantId: number): Promise<{ driverId: number; name: string | null; email: string }[]> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await db
      .select({ driverId: driverSessions.driverId, name: users.name, email: users.email })
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

  // ── Restaurant-scoped orders ─────────────────────────────────────────────────

  async getRestaurantOrders(restaurantId: number): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.restaurantId, restaurantId))
      .orderBy(orders.createdAt);
  }

  async getRestaurantOrder(restaurantId: number, orderId: number): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));
    return order;
  }

  async createRestaurantOrder(data: InsertOrder & { restaurantId: number }): Promise<Order> {
    const [order] = await db.insert(orders).values(data).returning();
    return order;
  }

  async updateRestaurantOrderStatus(restaurantId: number, orderId: number, status: string): Promise<Order | undefined> {
    const [order] = await db
      .update(orders)
      .set({ status })
      .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
      .returning();
    return order;
  }

  async assignOrderToDriver(restaurantId: number, orderId: number, driverId: number | null): Promise<Order | undefined> {
    const [order] = await db
      .update(orders)
      .set({ assignedDriverId: driverId })
      .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
      .returning();
    return order;
  }

  async markRestaurantOrderDelivered(restaurantId: number, orderId: number): Promise<boolean> {
    const order = await this.getRestaurantOrder(restaurantId, orderId);
    if (!order) return false;

    await db.insert(deliveredOrders).values({
      restaurantId:     order.restaurantId,
      orderNumber:      order.orderNumber,
      address:          order.address,
      platform:         order.platform,
      latitude:         order.latitude,
      longitude:        order.longitude,
      assignedDriverId: order.assignedDriverId ?? null,
      originalOrderId:  order.id,
    });

    await this.deleteOrder(order.id);
    return true;
  }

  async getRestaurantDeliveredOrders(
    restaurantId: number,
  ): Promise<(DeliveredOrder & { driverName: string | null; driverEmail: string | null })[]> {
    const rows = await db
      .select({
        id:               deliveredOrders.id,
        restaurantId:     deliveredOrders.restaurantId,
        orderNumber:      deliveredOrders.orderNumber,
        address:          deliveredOrders.address,
        platform:         deliveredOrders.platform,
        latitude:         deliveredOrders.latitude,
        longitude:        deliveredOrders.longitude,
        assignedDriverId: deliveredOrders.assignedDriverId,
        deliveredAt:      deliveredOrders.deliveredAt,
        originalOrderId:  deliveredOrders.originalOrderId,
        driverName:       users.name,
        driverEmail:      users.email,
      })
      .from(deliveredOrders)
      .leftJoin(users, eq(deliveredOrders.assignedDriverId, users.id))
      .where(eq(deliveredOrders.restaurantId, restaurantId))
      .orderBy(deliveredOrders.deliveredAt);
    return rows.map(r => ({ ...r, driverName: r.driverName ?? null, driverEmail: r.driverEmail ?? null }));
  }

  async getTodaysDeliveredRestaurantOrders(restaurantId: number): Promise<DeliveredOrder[]> {
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

  async getDriverOrders(restaurantId: number, driverId: number): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, restaurantId),
          eq(orders.assignedDriverId, driverId)
        )
      )
      .orderBy(orders.createdAt);
  }

  // ── Staff management ─────────────────────────────────────────────────────────

  async getRestaurantStaff(
    restaurantId: number,
  ): Promise<{ userId: number; staffCode: string | null; name: string | null; email: string; role: string; createdAt: Date }[]> {
    return await db
      .select({
        userId:    users.id,
        staffCode: restaurantUsers.staffCode,
        name:      users.name,
        email:     users.email,
        role:      restaurantUsers.role,
        createdAt: users.createdAt,
      })
      .from(restaurantUsers)
      .innerJoin(users, eq(restaurantUsers.userId, users.id))
      .where(eq(restaurantUsers.restaurantId, restaurantId))
      .orderBy(restaurantUsers.id);
  }

  async addStaffMember(
    restaurantId: number,
    { name, email, passwordHash, role }: { name: string; email: string; passwordHash: string; role: string },
  ): Promise<{ userId: number; staffCode: string | null; name: string | null; email: string; role: string; createdAt: Date }> {
    const [restaurant] = await db
      .select({ slug: restaurants.slug })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId));
    if (!restaurant) throw new Error("Restaurant not found");

    const staffCode = await nextStaffCode(restaurantId, restaurant.slug, role);

    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(users).where(eq(users.email, email));
      if (existing) {
        const [membership] = await tx
          .select()
          .from(restaurantUsers)
          .where(and(eq(restaurantUsers.userId, existing.id), eq(restaurantUsers.restaurantId, restaurantId)));
        if (membership) {
          throw Object.assign(new Error("Already a staff member at this restaurant"), { code: "ALREADY_MEMBER" });
        }
        const [ru] = await tx
          .insert(restaurantUsers)
          .values({ userId: existing.id, restaurantId, role: role as any, staffCode })
          .returning();
        return { userId: existing.id, staffCode: ru.staffCode, name: existing.name, email: existing.email, role, createdAt: existing.createdAt };
      }
      const [newUser] = await tx.insert(users).values({ name, email, passwordHash }).returning();
      const [ru] = await tx
        .insert(restaurantUsers)
        .values({ userId: newUser.id, restaurantId, role: role as any, staffCode })
        .returning();
      return { userId: newUser.id, staffCode: ru.staffCode, name: newUser.name, email: newUser.email, role, createdAt: newUser.createdAt };
    });
  }

  async removeStaffMember(restaurantId: number, userId: number): Promise<boolean> {
    const result = await db
      .delete(restaurantUsers)
      .where(and(eq(restaurantUsers.userId, userId), eq(restaurantUsers.restaurantId, restaurantId)))
      .returning();
    return result.length > 0;
  }

  async updateStaffRole(restaurantId: number, userId: number, role: string): Promise<boolean> {
    const result = await db
      .update(restaurantUsers)
      .set({ role: role as any })
      .where(and(eq(restaurantUsers.userId, userId), eq(restaurantUsers.restaurantId, restaurantId)))
      .returning();
    return result.length > 0;
  }

  // ── Settings ─────────────────────────────────────────────────────────────────

  async updateRestaurantName(restaurantId: number, name: string): Promise<Restaurant> {
    const [restaurant] = await db
      .update(restaurants)
      .set({ name })
      .where(eq(restaurants.id, restaurantId))
      .returning();
    return restaurant;
  }
}

export const storage = new DatabaseStorage();
