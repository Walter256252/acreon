import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { gmailSettingsTable, emailNotesTable, propertiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GMAIL_CONNECTED } from "../lib/gmailClient";

const router: IRouter = Router();

// GET /gmail/status
router.get("/gmail/status", async (_req, res) => {
  res.json({ connected: GMAIL_CONNECTED });
});

// GET /gmail/settings — all properties with their gmail settings
router.get("/gmail/settings", async (_req, res) => {
  const properties = await db.select().from(propertiesTable).orderBy(propertiesTable.createdAt);
  const settings = await db.select().from(gmailSettingsTable);
  const settingsMap = new Map(settings.map((s) => [s.propertyId, s]));

  // Get last synced per property
  const lastSyncedRows = await db.select({
    propertyId: emailNotesTable.propertyId,
    syncedAt: emailNotesTable.syncedAt,
  }).from(emailNotesTable).orderBy(emailNotesTable.syncedAt);

  const lastSyncedMap = new Map<number, string>();
  for (const row of lastSyncedRows) {
    lastSyncedMap.set(row.propertyId, row.syncedAt.toISOString());
  }

  const result = properties.map((p) => ({
    propertyId: p.id,
    propertyName: p.name,
    propertyAddress: p.address,
    pullMode: settingsMap.get(p.id)?.pullMode ?? "address",
    gmailLabel: settingsMap.get(p.id)?.gmailLabel ?? null,
    lastSynced: lastSyncedMap.get(p.id) ?? null,
  }));

  res.json(result);
});

// PUT /gmail/settings/:propertyId
router.put("/gmail/settings/:propertyId", async (req, res) => {
  const propertyId = Number(req.params.propertyId);
  const { pullMode, gmailLabel } = req.body as { pullMode: string; gmailLabel?: string | null };

  if (!["label", "address"].includes(pullMode)) {
    res.status(400).json({ error: "pullMode must be 'label' or 'address'" });
    return;
  }

  await db
    .insert(gmailSettingsTable)
    .values({ propertyId, pullMode, gmailLabel: gmailLabel ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: gmailSettingsTable.propertyId,
      set: { pullMode, gmailLabel: gmailLabel ?? null, updatedAt: new Date() },
    });

  res.json({ success: true });
});

// POST /gmail/sync/:propertyId
router.post("/gmail/sync/:propertyId", async (req, res) => {
  if (!GMAIL_CONNECTED) {
    res.status(503).json({ error: "Gmail not connected" });
    return;
  }
  // Full Gmail sync implemented after OAuth wiring
  res.json({ synced: 0, propertyId: Number(req.params.propertyId) });
});

// POST /gmail/sync — sync all properties
router.post("/gmail/sync", async (_req, res) => {
  if (!GMAIL_CONNECTED) {
    res.status(503).json({ error: "Gmail not connected" });
    return;
  }
  res.json({ synced: 0 });
});

// GET /gmail/notes/:propertyId — notes grouped by month, newest first
router.get("/gmail/notes/:propertyId", async (req, res) => {
  const propertyId = Number(req.params.propertyId);

  const notes = await db
    .select()
    .from(emailNotesTable)
    .where(eq(emailNotesTable.propertyId, propertyId))
    .orderBy(emailNotesTable.threadDate);

  // Group by month
  const byMonth: Record<string, typeof notes> = {};
  for (const note of notes) {
    if (!byMonth[note.monthYear]) byMonth[note.monthYear] = [];
    byMonth[note.monthYear].push(note);
  }

  const result = Object.entries(byMonth)
    .sort(([a], [b]) => b.localeCompare(a)) // newest first
    .map(([monthYear, monthNotes]) => ({
      monthYear,
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
