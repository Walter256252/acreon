import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { propertiesTable, userPreferencesTable, paymentsTable } from "@workspace/db";
import { count, eq } from "drizzle-orm";

const router: IRouter = Router();

function uid(req: Request) {
  return getAuth(req).userId ?? null;
}

// ── Admin guard middleware ──────────────────────────────────────────────────

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = uid(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const user = await clerkClient.users.getUser(userId);
    if (user.publicMetadata?.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  } catch {
    res.status(403).json({ error: "Admin access required" });
  }
}

// ── GET /admin/exists ──────────────────────────────────────────────────────
// Public — tells the frontend whether any admin has been claimed yet.

router.get("/admin/exists", async (_req, res) => {
  const { data: allUsers } = await clerkClient.users.getUserList({ limit: 500 });
  const adminExists = allUsers.some((u) => u.publicMetadata?.role === "admin");
  res.json({ adminExists });
});

// ── POST /admin/become ─────────────────────────────────────────────────────
// Bootstrap: first user to call this becomes admin IF no admin exists yet.

router.post("/admin/become", async (req, res) => {
  const userId = uid(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  // Check if any admin already exists
  const { data: allUsers } = await clerkClient.users.getUserList({ limit: 500 });
  const existingAdmin = allUsers.find((u) => u.publicMetadata?.role === "admin");

  if (existingAdmin && existingAdmin.id !== userId) {
    res.status(403).json({ error: "An admin already exists. Ask them to promote you." });
    return;
  }

  await clerkClient.users.updateUser(userId, {
    publicMetadata: { role: "admin" },
  });

  res.json({ success: true, message: "You are now an admin." });
});

// ── GET /admin/stats ───────────────────────────────────────────────────────

router.get("/admin/stats", requireAdmin, async (_req, res) => {
  const [
    { data: allUsers, totalCount: totalUsers },
    [{ value: totalProperties }],
    [{ value: totalPayments }],
    digestPrefs,
  ] = await Promise.all([
    clerkClient.users.getUserList({ limit: 500, orderBy: "-created_at" }),
    db.select({ value: count() }).from(propertiesTable),
    db.select({ value: count() }).from(paymentsTable),
    db.select().from(userPreferencesTable),
  ]);

  const adminCount = allUsers.filter((u) => u.publicMetadata?.role === "admin").length;
  const digestEnabledCount = digestPrefs.filter((p) => p.monthlyDigestEnabled).length;

  // Recent 20 users with their metadata
  const recentUsers = allUsers.slice(0, 20).map((u) => ({
    id: u.id,
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    email: u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? "",
    imageUrl: u.imageUrl,
    createdAt: new Date(u.createdAt).toISOString(),
    lastSignInAt: u.lastSignInAt ? new Date(u.lastSignInAt).toISOString() : null,
    role: (u.publicMetadata?.role as string) ?? "user",
  }));

  res.json({
    totalUsers: totalUsers ?? allUsers.length,
    totalProperties,
    totalPayments,
    adminCount,
    digestEnabledCount,
    recentUsers,
  });
});

// ── POST /admin/users/:userId/make-admin ───────────────────────────────────

router.post("/admin/users/:targetId/make-admin", requireAdmin, async (req, res) => {
  const targetId = String(req.params.targetId);
  try {
    await clerkClient.users.updateUser(targetId, {
      publicMetadata: { role: "admin" },
    });
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: "Failed to promote user" });
  }
});

// ── POST /admin/users/:userId/remove-admin ─────────────────────────────────

router.post("/admin/users/:targetId/remove-admin", requireAdmin, async (req, res) => {
  const userId = uid(req);
  const targetId = String(req.params.targetId);
  if (targetId === userId) {
    res.status(400).json({ error: "You cannot remove your own admin role." });
    return;
  }
  try {
    await clerkClient.users.updateUser(targetId, {
      publicMetadata: { role: "user" },
    });
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: "Failed to remove admin role" });
  }
});

export default router;
