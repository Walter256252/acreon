import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  emailConnectionsTable,
  gmailSettingsTable,
  emailNotesTable,
  propertiesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { testConnection, syncPropertyEmails, type ImapCredentials } from "../lib/imapSync";
import { syncPropertyEmailsViaGmail } from "../lib/gmailApiSync";
import { createOAuthState, getCallbackUrl } from "./emailPublic";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────

function getConn(req: Parameters<typeof getAuth>[0]) {
  return getAuth(req).userId ?? null;
}

function toCredsOrNull(conn: typeof emailConnectionsTable.$inferSelect | undefined): ImapCredentials | null {
  if (!conn?.imapHost || !conn?.imapEmail || !conn?.imapPassword) return null;
  return {
    host: conn.imapHost,
    port: conn.imapPort ?? 993,
    email: conn.imapEmail,
    password: conn.imapPassword,
    tls: conn.imapTls ?? true,
  };
}

function isGmailOAuth(conn: typeof emailConnectionsTable.$inferSelect | null): conn is typeof emailConnectionsTable.$inferSelect & {
  gmailAccessToken: string;
  gmailRefreshToken: string;
  gmailTokenExpiry: Date;
} {
  return (
    conn?.provider === "gmail" &&
    !!conn.gmailAccessToken &&
    !!conn.gmailRefreshToken &&
    !!conn.gmailTokenExpiry
  );
}

async function getUserConnection(userId: string) {
  const [conn] = await db
    .select()
    .from(emailConnectionsTable)
    .where(and(eq(emailConnectionsTable.userId, userId), eq(emailConnectionsTable.verified, true)));
  return conn ?? null;
}

// ── Connection management ─────────────────────────────────────────────────

// GET /email/status
router.get("/email/status", async (req, res) => {
  const userId = getConn(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const conn = await getUserConnection(userId);
  res.json({ connected: !!conn, email: conn?.displayEmail ?? null });
});

// GET /email/connection
router.get("/email/connection", async (req, res) => {
  const userId = getConn(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const conn = await getUserConnection(userId);
  if (!conn) { res.status(404).json({ error: "No connection" }); return; }
  // Never return the password
  res.json({
    id: conn.id,
    displayEmail: conn.displayEmail,
    provider: conn.provider,
    imapHost: conn.imapHost,
    imapPort: conn.imapPort,
    imapEmail: conn.imapEmail,
    imapTls: conn.imapTls,
    verified: conn.verified,
    lastError: conn.lastError,
    createdAt: conn.createdAt.toISOString(),
  });
});

// POST /email/connect
router.post("/email/connect", async (req, res) => {
  const userId = getConn(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { displayEmail, imapHost, imapPort, imapEmail, imapPassword, imapTls } =
    req.body as Record<string, string | number | boolean>;

  if (!imapHost || !imapEmail || !imapPassword) {
    res.status(400).json({ error: "imapHost, imapEmail, and imapPassword are required" });
    return;
  }

  const creds: ImapCredentials = {
    host: String(imapHost),
    port: Number(imapPort) || 993,
    email: String(imapEmail),
    password: String(imapPassword),
    tls: imapTls !== false,
  };

  // Test the connection before saving
  try {
    await testConnection(creds);
  } catch {
    res.status(400).json({ error: "Could not connect to the mail server. Check your host, port, email address, and password." });
    return;
  }

  const [saved] = await db
    .insert(emailConnectionsTable)
    .values({
      userId,
      displayEmail: String(displayEmail || imapEmail),
      provider: "imap",
      imapHost: creds.host,
      imapPort: creds.port,
      imapEmail: creds.email,
      imapPassword: creds.password,
      imapTls: creds.tls,
      verified: true,
      lastError: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: emailConnectionsTable.userId,
      set: {
        displayEmail: String(displayEmail || imapEmail),
        imapHost: creds.host,
        imapPort: creds.port,
        imapEmail: creds.email,
        imapPassword: creds.password,
        imapTls: creds.tls,
        verified: true,
        lastError: null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: emailConnectionsTable.id, displayEmail: emailConnectionsTable.displayEmail });

  res.json({ success: true, displayEmail: saved.displayEmail });
});

// DELETE /email/connection
router.delete("/email/connection", async (req, res) => {
  const userId = getConn(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  await db.delete(emailConnectionsTable).where(eq(emailConnectionsTable.userId, userId));
  res.json({ success: true });
});

// ── Gmail OAuth ───────────────────────────────────────────────────────────

// GET /email/gmail/auth-url — returns the Google OAuth URL to redirect the user to
router.get("/email/gmail/auth-url", async (req, res) => {
  const userId = getConn(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    res.status(503).json({ error: "Google OAuth is not configured on this server." });
    return;
  }

  const returnTo = String(req.query.returnTo ?? "");
  const state = createOAuthState(userId, returnTo);

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: getCallbackUrl(req),
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "email",
      "profile",
    ].join(" "),
    access_type: "offline",
    prompt: "select_account consent", // force account picker, then consent for refresh_token
    state,
  });

  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});

// ── Pull settings ─────────────────────────────────────────────────────────

// GET /email/settings
router.get("/email/settings", async (req, res) => {
  const userId = getConn(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [properties, settings, lastRows] = await Promise.all([
    db.select().from(propertiesTable)
      .where(eq(propertiesTable.clerkUserId, userId))
      .orderBy(propertiesTable.createdAt),
    db.select().from(gmailSettingsTable).where(eq(gmailSettingsTable.userId, userId)),
    db
      .select({ propertyId: emailNotesTable.propertyId, syncedAt: emailNotesTable.syncedAt })
      .from(emailNotesTable)
      .where(eq(emailNotesTable.userId, userId))
      .orderBy(emailNotesTable.syncedAt),
  ]);

  const settingsMap = new Map(settings.map((s) => [s.propertyId, s]));
  const lastMap = new Map<number, string>();
  for (const r of lastRows) lastMap.set(r.propertyId, r.syncedAt.toISOString());

  res.json(
    properties.map((p) => ({
      propertyId: p.id,
      propertyName: p.name,
      propertyAddress: p.address,
      pullMode: settingsMap.get(p.id)?.pullMode ?? "address",
      emailFolder: settingsMap.get(p.id)?.gmailLabel ?? null,
      lastSynced: lastMap.get(p.id) ?? null,
    }))
  );
});

// PUT /email/settings/:propertyId
router.put("/email/settings/:propertyId", async (req, res) => {
  const userId = getConn(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const propertyId = Number(req.params.propertyId);
  const { pullMode, emailFolder } = req.body as { pullMode: string; emailFolder?: string | null };

  if (!["label", "address"].includes(pullMode)) {
    res.status(400).json({ error: "pullMode must be 'label' or 'address'" });
    return;
  }

  // Delete + re-insert (composite unique makes upsert awkward with drizzle)
  await db
    .delete(gmailSettingsTable)
    .where(and(eq(gmailSettingsTable.propertyId, propertyId), eq(gmailSettingsTable.userId, userId)));
  await db.insert(gmailSettingsTable).values({
    propertyId,
    userId,
    pullMode,
    gmailLabel: emailFolder ?? null,
    updatedAt: new Date(),
  });

  res.json({ success: true });
});

// ── Sync ──────────────────────────────────────────────────────────────────

// POST /email/sync/:propertyId
router.post("/email/sync/:propertyId", async (req, res) => {
  const userId = getConn(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const propertyId = Number(req.params.propertyId);
  const emailConn = await getUserConnection(userId);
  if (!emailConn) { res.status(503).json({ error: "Email not connected" }); return; }

  // Verify the property exists AND belongs to this user
  const [property] = await db.select().from(propertiesTable)
    .where(and(eq(propertiesTable.id, propertyId), eq(propertiesTable.clerkUserId, userId)));
  if (!property) { res.status(404).json({ error: "Property not found" }); return; }

  const [setting] = await db
    .select()
    .from(gmailSettingsTable)
    .where(and(eq(gmailSettingsTable.propertyId, propertyId), eq(gmailSettingsTable.userId, userId)));

  try {
    let synced: number;
    if (isGmailOAuth(emailConn)) {
      synced = await syncPropertyEmailsViaGmail(
        userId,
        emailConn.gmailAccessToken,
        emailConn.gmailRefreshToken,
        emailConn.gmailTokenExpiry,
        propertyId,
        setting?.pullMode ?? "address",
        setting?.gmailLabel ?? null,
        property.address,
      );
    } else {
      const creds = toCredsOrNull(emailConn);
      if (!creds) { res.status(503).json({ error: "Email connection is incomplete" }); return; }
      synced = await syncPropertyEmails(creds, propertyId, userId, setting?.pullMode ?? "address", setting?.gmailLabel ?? null, property.address);
    }
    res.json({ synced, propertyId });
  } catch {
    res.status(500).json({ error: "Email sync failed — please try again or re-check your connection settings." });
  }
});

// POST /email/sync (all properties)
router.post("/email/sync", async (req, res) => {
  const userId = getConn(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const emailConn = await getUserConnection(userId);
  if (!emailConn) { res.status(503).json({ error: "Email not connected" }); return; }

  // Only sync the authenticated user's own properties
  const properties = await db.select().from(propertiesTable)
    .where(eq(propertiesTable.clerkUserId, userId));
  const settings = await db.select().from(gmailSettingsTable).where(eq(gmailSettingsTable.userId, userId));
  const settingsMap = new Map(settings.map((s) => [s.propertyId, s]));

  let total = 0;
  for (const p of properties) {
    const s = settingsMap.get(p.id);
    try {
      if (isGmailOAuth(emailConn)) {
        total += await syncPropertyEmailsViaGmail(
          userId,
          emailConn.gmailAccessToken,
          emailConn.gmailRefreshToken,
          emailConn.gmailTokenExpiry,
          p.id,
          s?.pullMode ?? "address",
          s?.gmailLabel ?? null,
          p.address,
        );
      } else {
        const creds = toCredsOrNull(emailConn);
        if (creds) total += await syncPropertyEmails(creds, p.id, userId, s?.pullMode ?? "address", s?.gmailLabel ?? null, p.address);
      }
    } catch { /* continue with other properties */ }
  }

  res.json({ synced: total });
});

// ── Notes ─────────────────────────────────────────────────────────────────

// GET /email/notes/:propertyId
router.get("/email/notes/:propertyId", async (req, res) => {
  const userId = getConn(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const propertyId = Number(req.params.propertyId);
  const notes = await db
    .select()
    .from(emailNotesTable)
    .where(and(eq(emailNotesTable.propertyId, propertyId), eq(emailNotesTable.userId, userId)))
    .orderBy(emailNotesTable.threadDate);

  const byMonth: Record<string, typeof notes> = {};
  for (const n of notes) {
    if (!byMonth[n.monthYear]) byMonth[n.monthYear] = [];
    byMonth[n.monthYear].push(n);
  }

  const result = Object.entries(byMonth)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, monthNotes]) => ({
      monthYear: month,
      notes: monthNotes.map((n) => ({
        id: n.id,
        propertyId: n.propertyId,
        threadId: n.threadId,
        subject: n.subject,
        participants: JSON.parse(n.participants) as string[],
        monthYear: n.monthYear,
        aiSummary: n.aiSummary,
        actionItems: JSON.parse(n.actionItems) as string[],
        keyDates: JSON.parse(n.keyDates) as { date: string; description: string }[],
        threadDate: n.threadDate.toISOString(),
        syncedAt: n.syncedAt.toISOString(),
      })),
    }));

  res.json(result);
});

export default router;
