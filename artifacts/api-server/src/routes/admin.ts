import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { propertiesTable, userPreferencesTable, termsAcceptancesTable } from "@workspace/db";
import { count, desc, sum } from "drizzle-orm";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { buildRawEmail } from "../lib/digestSender";
import { buildAmortizationSchedule } from "./payments";

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
    digestPrefs,
    allProperties,
  ] = await Promise.all([
    clerkClient.users.getUserList({ limit: 500, orderBy: "-created_at" }),
    db.select().from(userPreferencesTable),
    db.select().from(propertiesTable),
  ]);

  const totalUsers = totalCount ?? allUsers.length;
  const totalProperties = allProperties.length;
  const adminCount = allUsers.filter((u) => u.publicMetadata?.role === "admin").length;
  const digestEnabledCount = digestPrefs.filter((p) => p.monthlyDigestEnabled).length;

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const activeThisMonth = allUsers.filter(
    (u) => u.lastSignInAt != null && u.lastSignInAt > thirtyDaysAgo
  ).length;

  // ── Platform-wide financial totals ────────────────────────────────────────
  let platformPortfolioValue = 0;
  let platformLoanBalance = 0;
  const platformOriginalLoan = allProperties.reduce((s, p) => s + Number(p.loanAmount), 0);

  for (const prop of allProperties) {
    platformPortfolioValue += Number(prop.currentValue);

    const now = new Date();
    const start = new Date(prop.loanStartDate);
    const monthsElapsed =
      (now.getFullYear() - start.getFullYear()) * 12 +
      (now.getMonth() - start.getMonth());

    const savedExtras =
      (prop.savedExtraPayments as Array<{ paymentNumber: number; amount: number }> | null) ?? [];

    const schedule = buildAmortizationSchedule({
      loanAmount: Number(prop.loanAmount),
      interestRate: Number(prop.interestRate),
      loanTermYears: prop.loanTermYears,
      loanStartDate: prop.loanStartDate,
      monthlyPayment: Number(prop.monthlyPayment),
      extraPaymentMonthly: prop.savedExtraMonthly != null ? Number(prop.savedExtraMonthly) : 0,
      extraPayments: savedExtras,
      startingBalance: prop.currentLoanBalance != null ? Number(prop.currentLoanBalance) : undefined,
    });

    const idx = Math.max(0, Math.min(monthsElapsed - 1, schedule.length - 1));
    const balance = monthsElapsed <= 0
      ? (prop.currentLoanBalance != null ? Number(prop.currentLoanBalance) : Number(prop.loanAmount))
      : (schedule[idx]?.remainingBalance ?? 0);

    platformLoanBalance += balance;
  }

  const platformEquity = platformPortfolioValue - platformLoanBalance;

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
    platformPortfolioValue: Math.round(platformPortfolioValue),
    platformEquity: Math.round(platformEquity),
    platformOriginalLoan: Math.round(platformOriginalLoan),
    platformLoanBalance: Math.round(platformLoanBalance),
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

// ── POST /api/onboarding/complete ──────────────────────────────────────────
// Called by the onboarding page after the user accepts T&C.
// Logs the acceptance to the DB and sends an email notification to admins.

router.post("/onboarding/complete", async (req, res) => {
  const userId = uid(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { phone, email } = req.body as { phone?: string; email?: string };
  if (!phone || !email) { res.status(400).json({ error: "phone and email are required" }); return; }

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    null;
  const userAgent = (req.headers["user-agent"] as string | undefined) ?? null;

  // Persist to DB
  await db.insert(termsAcceptancesTable).values({
    userId,
    email,
    phone,
    ipAddress: ip,
    userAgent,
  });

  // Notify admins via Gmail
  try {
    const { data: allUsers } = await clerkClient.users.getUserList({ limit: 500 });
    const adminEmails = allUsers
      .filter((u) => u.publicMetadata?.role === "admin")
      .map((u) => u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress)
      .filter((e): e is string => Boolean(e));

    if (adminEmails.length > 0) {
      const acceptedAt = new Date().toLocaleString("en-US", { timeZone: "UTC", dateStyle: "long", timeStyle: "short" });
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="font-size:18px;color:#1a1a1a;margin-bottom:16px">✅ New User T&amp;C Acceptance — RealTrack</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:600;width:130px">Email</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${email}</td></tr>
            <tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:600">Phone</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${phone}</td></tr>
            <tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:600">Accepted at</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${acceptedAt} UTC</td></tr>
            <tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:600">IP Address</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${ip ?? "—"}</td></tr>
          </table>
          <p style="margin-top:20px;font-size:12px;color:#999">Full acceptance log available in your RealTrack Admin Dashboard → T&amp;C Acceptances.</p>
        </div>`;
      const text = `New T&C acceptance on RealTrack\n\nEmail: ${email}\nPhone: ${phone}\nAccepted at: ${acceptedAt} UTC\nIP: ${ip ?? "—"}`;

      const connectors = new ReplitConnectors();
      const gmail = connectors.gmail as {
        request: (opts: { method: string; path: string; body?: unknown }) => Promise<unknown>;
      };
      for (const adminEmail of adminEmails) {
        await gmail.request({
          method: "POST",
          path: "/gmail/v1/users/me/messages/send",
          body: { raw: buildRawEmail(adminEmail, "New user accepted T&C — RealTrack", html, text) },
        }).catch(() => { /* don't block signup if email fails */ });
      }
    }
  } catch {
    // Email notification is best-effort — don't fail the request
  }

  res.json({ success: true });
});

// ── GET /admin/terms-acceptances ───────────────────────────────────────────

router.get("/admin/terms-acceptances", requireAdmin, async (_req, res) => {
  const rows = await db
    .select()
    .from(termsAcceptancesTable)
    .orderBy(desc(termsAcceptancesTable.acceptedAt));
  res.json(rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    email: r.email,
    phone: r.phone,
    ipAddress: r.ipAddress ?? null,
    userAgent: r.userAgent ?? null,
    acceptedAt: r.acceptedAt.toISOString(),
  })));
});

export default router;
