import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { propertiesTable, userPreferencesTable } from "@workspace/db";
import { count } from "drizzle-orm";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { buildRawEmail } from "../lib/digestSender";

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
    { data: allUsers, totalCount },
    [{ value: totalProperties }],
    digestPrefs,
  ] = await Promise.all([
    clerkClient.users.getUserList({ limit: 500, orderBy: "-created_at" }),
    db.select({ value: count() }).from(propertiesTable),
    db.select().from(userPreferencesTable),
  ]);

  const totalUsers = totalCount ?? allUsers.length;
  const adminCount = allUsers.filter((u) => u.publicMetadata?.role === "admin").length;
  const digestEnabledCount = digestPrefs.filter((p) => p.monthlyDigestEnabled).length;

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const activeThisMonth = allUsers.filter(
    (u) => u.lastSignInAt != null && u.lastSignInAt > thirtyDaysAgo
  ).length;

  const recentUsers = allUsers.slice(0, 50).map((u) => ({
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
    totalUsers,
    totalProperties,
    activeThisMonth,
    adminCount,
    digestEnabledCount,
    recentUsers,
  });
});

// ── GET /admin/users/find?email=... ────────────────────────────────────────

router.get("/admin/users/find", requireAdmin, async (req, res) => {
  const email = String(req.query.email ?? "").trim().toLowerCase();
  if (!email) { res.status(400).json({ error: "email query param required" }); return; }

  const { data } = await clerkClient.users.getUserList({ emailAddress: [email], limit: 5 });
  if (!data.length) { res.status(404).json({ error: "No user found with that email address." }); return; }

  const u = data[0];
  res.json({
    id: u.id,
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    email: u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? email,
    imageUrl: u.imageUrl,
    role: (u.publicMetadata?.role as string) ?? "user",
  });
});

// ── POST /admin/users/:targetId/make-admin ─────────────────────────────────

router.post("/admin/users/:targetId/make-admin", requireAdmin, async (req, res) => {
  const targetId = String(req.params.targetId);
  try {
    await clerkClient.users.updateUser(targetId, { publicMetadata: { role: "admin" } });
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: "Failed to promote user" });
  }
});

// ── POST /admin/users/:targetId/remove-admin ───────────────────────────────

router.post("/admin/users/:targetId/remove-admin", requireAdmin, async (req, res) => {
  const userId = uid(req);
  const targetId = String(req.params.targetId);
  if (targetId === userId) {
    res.status(400).json({ error: "You cannot remove your own admin role." });
    return;
  }
  try {
    await clerkClient.users.updateUser(targetId, { publicMetadata: { role: "user" } });
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: "Failed to remove admin role" });
  }
});

// ── POST /admin/broadcast-email ────────────────────────────────────────────

router.post("/admin/broadcast-email", requireAdmin, async (req, res) => {
  const { subject, message } = req.body as { subject?: string; message?: string };
  if (!subject?.trim() || !message?.trim()) {
    res.status(400).json({ error: "subject and message are required" });
    return;
  }

  const { data: allUsers } = await clerkClient.users.getUserList({ limit: 500 });
  const recipients = allUsers
    .map((u) => u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress)
    .filter((e): e is string => Boolean(e));

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <div style="margin-bottom:24px">
        <img src="https://realtrack.app/logo.svg" alt="RealTrack" style="height:32px" onerror="this.style.display='none'" />
        <h2 style="margin:0;font-size:20px;color:#1a1a1a">Message from RealTrack</h2>
      </div>
      <div style="white-space:pre-wrap;color:#333;line-height:1.6">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
      <hr style="margin:32px 0;border:none;border-top:1px solid #eee" />
      <p style="font-size:12px;color:#999">You're receiving this because you have a RealTrack account.</p>
    </div>`;

  const text = `Message from RealTrack\n\n${message}\n\n---\nYou're receiving this because you have a RealTrack account.`;

  const connectors = new ReplitConnectors();
  const gmail = connectors.gmail as {
    request: (opts: { method: string; path: string; body?: unknown }) => Promise<unknown>;
  };

  let sent = 0;
  let failed = 0;
  for (const email of recipients) {
    try {
      await gmail.request({
        method: "POST",
        path: "/gmail/v1/users/me/messages/send",
        body: { raw: buildRawEmail(email, subject.trim(), html, text) },
      });
      sent++;
    } catch {
      failed++;
    }
  }

  res.json({ sent, failed, total: recipients.length });
});

export default router;
