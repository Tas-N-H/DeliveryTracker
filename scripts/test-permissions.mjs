/**
 * Permission Middleware Integration Test
 * Tests all four roles against every protected route, plus the no-session case.
 * Run with: node scripts/test-permissions.mjs
 */

import bcrypt from "bcrypt";
import pg from "pg";

const BASE = "http://localhost:5000";
const SLUG = "test-restaurant-perms";

// ── DB helpers ────────────────────────────────────────────────────────────────

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function query(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

// Mimic the Replit proxy: send X-Forwarded-Proto: https so that
// express-session (secure: true + trust proxy: 1) actually sets the cookie.
const PROXY_HEADERS = { "X-Forwarded-Proto": "https" };

async function login(slug, email, password) {
  const res = await fetch(`${BASE}/api/${slug}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...PROXY_HEADERS },
    body: JSON.stringify({ email, password }),
  });
  // Extract only the name=value part of every Set-Cookie header
  // (strip Path, HttpOnly, SameSite, etc.)
  const rawCookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  const cookie = rawCookies
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
  return { status: res.status, cookie };
}

async function request(method, path, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...PROXY_HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedTestData() {
  const hash = await bcrypt.hash("TestPass123!", 10);

  // Upsert restaurant
  const [restaurant] = await query(
    `INSERT INTO restaurants (name, slug)
     VALUES ('Test Restaurant', $1)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [SLUG]
  );
  const restaurantId = restaurant.id;

  const roles = ["owner", "manager", "employee", "driver"];
  const users = {};

  for (const role of roles) {
    const email = `test-${role}@perms.test`;

    // Upsert user
    const [user] = await query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [email, hash]
    );

    // Upsert membership
    await query(
      `INSERT INTO restaurant_users (user_id, restaurant_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [user.id, restaurantId, role]
    );

    users[role] = email;
  }

  return users;
}

async function cleanupTestData() {
  const [restaurant] = await query(
    `SELECT id FROM restaurants WHERE slug = $1`,
    [SLUG]
  );
  if (!restaurant) return;

  const emails = ["owner", "manager", "employee", "driver"].map(
    (r) => `test-${r}@perms.test`
  );

  const userRows = await query(
    `SELECT id FROM users WHERE email = ANY($1)`,
    [emails]
  );
  const userIds = userRows.map((r) => r.id);

  if (userIds.length) {
    await query(`DELETE FROM restaurant_users WHERE user_id = ANY($1)`, [userIds]);
    await query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
  }

  await query(`DELETE FROM restaurants WHERE id = $1`, [restaurant.id]);
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) passed++;
  else failed++;
  results.push({ ok, label, actual, expected });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log("Setting up test data...\n");
  const users = await seedTestData();

  // ── 1. No-session redirects ─────────────────────────────────────────────────
  console.log("── Test 1: No active session → 401 with redirectTo ──────────────");

  const protectedRoutes = [
    ["GET",    `/api/${SLUG}/orders`],
    ["GET",    `/api/${SLUG}/driver/orders`],
    ["GET",    `/api/${SLUG}/analytics`],
    ["PUT",    `/api/${SLUG}/settings`],
    ["POST",   `/api/${SLUG}/staff`],
  ];

  for (const [method, path] of protectedRoutes) {
    const { status, body } = await request(method, path, null);
    check(`No-session ${method} ${path} → 401`, status, 401);
    const hasRedirect = body.redirectTo === `/${SLUG}/login`;
    check(`No-session ${method} ${path} has redirectTo`, hasRedirect, true);
  }

  // ── 2. Owner ────────────────────────────────────────────────────────────────
  console.log("\n── Test 2: Owner — should access ALL routes ─────────────────────");

  const { cookie: ownerCookie, status: ownerLoginStatus } = await login(SLUG, users.owner, "TestPass123!");
  check("Owner login succeeds", ownerLoginStatus, 200);

  check("Owner GET /orders → 200",       (await request("GET",   `/api/${SLUG}/orders`,           ownerCookie)).status, 200);
  check("Owner GET /analytics → 200",    (await request("GET",   `/api/${SLUG}/analytics`,        ownerCookie)).status, 200);
  check("Owner PUT /settings → 200",     (await request("PUT",   `/api/${SLUG}/settings`,         ownerCookie)).status, 200);
  check("Owner POST /staff → 200",       (await request("POST",  `/api/${SLUG}/staff`,            ownerCookie)).status, 200);
  check("Owner DELETE /staff/1 → 200",   (await request("DELETE",`/api/${SLUG}/staff/1`,          ownerCookie)).status, 200);
  check("Owner POST order/assign → 200", (await request("POST",  `/api/${SLUG}/orders/1/assign`,  ownerCookie)).status, 200);
  // Driver-only route — owner should be blocked
  check("Owner GET /driver/orders → 403", (await request("GET", `/api/${SLUG}/driver/orders`, ownerCookie)).status, 403);

  // ── 3. Manager ──────────────────────────────────────────────────────────────
  console.log("\n── Test 3: Manager — blocked from settings ───────────────────────");

  const { cookie: managerCookie, status: managerLoginStatus } = await login(SLUG, users.manager, "TestPass123!");
  check("Manager login succeeds", managerLoginStatus, 200);

  check("Manager GET /orders → 200",      (await request("GET",  `/api/${SLUG}/orders`,          managerCookie)).status, 200);
  check("Manager GET /analytics → 200",   (await request("GET",  `/api/${SLUG}/analytics`,       managerCookie)).status, 200);
  check("Manager POST /staff → 200",      (await request("POST", `/api/${SLUG}/staff`,           managerCookie)).status, 200);
  check("Manager PUT /settings → 403",    (await request("PUT",  `/api/${SLUG}/settings`,        managerCookie)).status, 403);
  check("Manager GET /driver/orders → 403", (await request("GET", `/api/${SLUG}/driver/orders`, managerCookie)).status, 403);

  // Confirm the 403 carries the correct detail message
  const settingsBlock = await request("PUT", `/api/${SLUG}/settings`, managerCookie);
  check(
    "Manager /settings 403 detail mentions manage_settings",
    settingsBlock.body.detail?.includes("manage_settings"),
    true
  );

  // ── 4. Employee ─────────────────────────────────────────────────────────────
  console.log("\n── Test 4: Employee — blocked from staff management & analytics ──");

  const { cookie: employeeCookie, status: employeeLoginStatus } = await login(SLUG, users.employee, "TestPass123!");
  check("Employee login succeeds", employeeLoginStatus, 200);

  check("Employee GET /orders → 200",       (await request("GET",  `/api/${SLUG}/orders`,          employeeCookie)).status, 200);
  check("Employee GET /analytics → 403",    (await request("GET",  `/api/${SLUG}/analytics`,       employeeCookie)).status, 403);
  check("Employee POST /staff → 403",       (await request("POST", `/api/${SLUG}/staff`,           employeeCookie)).status, 403);
  check("Employee DELETE /staff/1 → 403",   (await request("DELETE",`/api/${SLUG}/staff/1`,        employeeCookie)).status, 403);
  check("Employee PUT /settings → 403",     (await request("PUT",  `/api/${SLUG}/settings`,        employeeCookie)).status, 403);
  check("Employee GET /driver/orders → 403",(await request("GET",  `/api/${SLUG}/driver/orders`,   employeeCookie)).status, 403);

  // ── 5. Driver ───────────────────────────────────────────────────────────────
  console.log("\n── Test 5: Driver — only own orders + delivery status ────────────");

  const { cookie: driverCookie, status: driverLoginStatus } = await login(SLUG, users.driver, "TestPass123!");
  check("Driver login succeeds", driverLoginStatus, 200);

  check("Driver GET /driver/orders → 200",          (await request("GET",   `/api/${SLUG}/driver/orders`,              driverCookie)).status, 200);
  check("Driver PATCH order delivery-status → 200", (await request("PATCH", `/api/${SLUG}/orders/1/delivery-status`,   driverCookie)).status, 200);
  check("Driver GET /orders → 403",                 (await request("GET",   `/api/${SLUG}/orders`,                     driverCookie)).status, 403);
  check("Driver GET /analytics → 403",              (await request("GET",   `/api/${SLUG}/analytics`,                  driverCookie)).status, 403);
  check("Driver PUT /settings → 403",               (await request("PUT",   `/api/${SLUG}/settings`,                   driverCookie)).status, 403);
  check("Driver POST /staff → 403",                 (await request("POST",  `/api/${SLUG}/staff`,                      driverCookie)).status, 403);

  // Confirm driver/orders response contains the driverId from session (server reads from session, not request)
  const driverOrders = await request("GET", `/api/${SLUG}/driver/orders`, driverCookie);
  const driverIdFromSession = typeof driverOrders.body.driverId === "number";
  check("Driver /driver/orders response includes driverId from session", driverIdFromSession, true);

  // ── 6. Cross-restaurant session isolation ───────────────────────────────────
  console.log("\n── Test 6: Session isolation — wrong slug returns 403 ────────────");

  const wrongSlugResult = await request("GET", `/api/some-other-restaurant/orders`, ownerCookie);
  check("Owner cookie on different restaurant slug → 403", wrongSlugResult.status, 403);

  // ── Results ──────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("RESULTS\n");

  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    const extra = r.ok ? "" : `  (got ${r.actual}, expected ${r.expected})`;
    console.log(`  ${icon}  ${r.label}${extra}`);
  }

  console.log(`\n  Passed: ${passed} / ${passed + failed}`);
  if (failed > 0) {
    console.log(`  Failed: ${failed}`);
  }

  console.log("══════════════════════════════════════════════════════════════════");

  await cleanupTestData();
  await pool.end();

  if (failed > 0) process.exit(1);
}

run().catch(async (err) => {
  console.error("Test run error:", err);
  await pool.end();
  process.exit(1);
});
