import type { RequestHandler } from "express";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RestaurantRole = "owner" | "manager" | "employee" | "driver";

export type Permission =
  | "view_orders"              // see all orders for this restaurant
  | "assign_order"             // assign an order to a driver
  | "view_own_orders"          // see only orders assigned to self
  | "update_delivery_status"   // mark order in-transit / delivered
  | "manage_staff"             // add or remove staff members
  | "view_analytics"           // view reports and analytics
  | "manage_settings"          // change restaurant settings
  | "view_active_drivers";     // see who is active/available today

// ── Permission matrix ─────────────────────────────────────────────────────────
// Each permission lists the roles that are ALLOWED to perform it.

const PERMISSION_MATRIX: Record<Permission, RestaurantRole[]> = {
  view_orders:             ["owner", "manager", "employee"],
  assign_order:            ["owner", "manager", "employee"],
  view_own_orders:         ["driver"],
  update_delivery_status:  ["driver"],
  manage_staff:            ["owner", "manager"],
  view_analytics:          ["owner", "manager"],
  manage_settings:         ["owner"],
  view_active_drivers:     ["owner", "manager", "employee"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function roleHasPermission(role: RestaurantRole, action: Permission): boolean {
  return PERMISSION_MATRIX[action].includes(role);
}

// ── Middleware: require an active restaurant session ──────────────────────────
// Reads restaurantSlug from req.params to validate the session belongs to
// the correct restaurant. Returns 401 with a redirectTo hint on failure.

export const requireRestaurantSession: RequestHandler = (req, res, next) => {
  const session = req.session.restaurantSession;
  const slug = req.params.restaurantSlug;

  if (!session) {
    return res.status(401).json({
      message: "Unauthorized",
      redirectTo: slug ? `/${slug}/login` : "/login",
    });
  }

  // Prevent a session for restaurant A from accessing restaurant B's routes
  if (slug && session.restaurantSlug !== slug) {
    return res.status(403).json({ message: "Forbidden" });
  }

  next();
};

// ── Middleware factory: require a specific permission ─────────────────────────
// Always reads role from the session — never from client-supplied data.
// Call after requireRestaurantSession.

export const requirePermission = (action: Permission): RequestHandler =>
  (req, res, next) => {
    const session = req.session.restaurantSession;

    // Belt-and-suspenders: should not happen if requireRestaurantSession ran first
    if (!session) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const role = session.role as RestaurantRole;

    if (!roleHasPermission(role, action)) {
      return res.status(403).json({
        message: "Forbidden",
        detail: `Role '${role}' does not have '${action}' permission`,
      });
    }

    next();
  };
