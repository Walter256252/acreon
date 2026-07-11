import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { gmailSettingsTable, emailNotesTable, propertiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GMAIL_CONNECTED, gmailGet } from "../lib/gmailClient";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

// ── Types for Gmail API responses ─────────────────────────────────────────

interface GmailThreadList {
  threads?: { id: string; snippet: string }[];
  nextPageToken?: string;
}

interface GmailMessage {
  id: string;
  internalDate?: string;
  payload?: {
    headers?: { name: string; value: string }[];
    parts?: GmailPart[];
    body?: { data?: string };
    mimeType?: string;
  };
}

interface GmailPart {
  mimeType: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

interface GmailThread {
  id: string;
  messages?: GmailMessage[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function decodeBase64(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function extractTextFromParts(parts: GmailPart[] | undefined): string {
  if (!parts) return "";
  const texts: string[] = [];
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      texts.push(decodeBase64(part.body.data));
    } else if (part.parts) {
      texts.push(extractTextFromParts(part.parts));
    }
  }
  return texts.join("\n");
}

function extractMessageBody(msg: GmailMessage): string {
  if (!msg.payload) return "";
  if (msg.payload.parts) return extractTextFromParts(msg.payload.parts);
  if (msg.payload.body?.data) return decodeBase64(msg.payload.body.data);
  return "";
}

function getHeader(msg: GmailMessage, name: string): string {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function monthYear(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildSearchQuery(pullMode: string, gmailLabel: string | null, address: string): string {
  if (pullMode === "label" && gmailLabel) {
    return `label:${gmailLabel.replace(/\s+/g, "-")}`;
  }
  // Use first part of address (street number + name) for search
  const streetPart = address.split(",")[0].trim();
  return `"${streetPart}"`;
}

// ── AI summarization ──────────────────────────────────────────────────────

interface AISummary {
  summary: string;
  actionItems: string[];
  keyDates: { date: string; description: string }[];
}

async function summarizeThread(subject: string, threadText: string): Promise<AISummary> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a real estate property management assistant. Given an email thread, extract a concise summary, any action items, and any key dates mentioned. Respond with JSON only in this exact format:
{
  "summary": "2-3 sentence plain-English summary of what the thread is about",
  "actionItems": ["action item 1", "action item 2"],
  "keyDates": [{"date": "Month DD, YYYY", "description": "what happens on this date"}]
}
Keep actionItems and keyDates as empty arrays if none are found. Be concise and factual.`,
      },
      {
        role: "user",
        content: `Subject: ${subject}\n\n${threadText.slice(0, 6000)}`,
      },
    ],
  });

  try {
    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
    return {
      summary: parsed.summary ?? "No summary available.",
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      keyDates: Array.isArray(parsed.keyDates) ? parsed.keyDates : [],
    };
  } catch {
    return { summary: "Could not parse summary.", actionItems: [], keyDates: [] };
  }
}

// ── Sync logic ────────────────────────────────────────────────────────────

async function syncProperty(propertyId: number, pullMode: string, gmailLabel: string | null, address: string): Promise<number> {
  const query = buildSearchQuery(pullMode, gmailLabel, address);

  // Fetch existing thread IDs so we don't re-process them
  const existing = await db.select({ threadId: emailNotesTable.threadId })
    .from(emailNotesTable)
    .where(eq(emailNotesTable.propertyId, propertyId));
  const existingIds = new Set(existing.map((r) => r.threadId));

  // Search Gmail for matching threads
  const threadList = await gmailGet<GmailThreadList>(
    "/gmail/v1/users/me/threads",
    { q: query, maxResults: "50" }
  );

  const threads = threadList.threads ?? [];
  let synced = 0;

  for (const { id: threadId } of threads) {
    if (existingIds.has(threadId)) continue;

    // Fetch full thread
    const thread = await gmailGet<GmailThread>(
      `/gmail/v1/users/me/threads/${threadId}`,
      { format: "full" }
    );

    const msgs = thread.messages ?? [];
    if (msgs.length === 0) continue;

    // Extract metadata from first message
    const firstMsg = msgs[0];
    const subject = getHeader(firstMsg, "subject") || "(no subject)";
    const rawDate = firstMsg.internalDate ? new Date(Number(firstMsg.internalDate)) : new Date();

    // Collect all participants
    const participantSet = new Set<string>();
    for (const msg of msgs) {
      const from = getHeader(msg, "from");
      const to = getHeader(msg, "to");
      if (from) participantSet.add(from.replace(/<.*>/, "").trim());
      if (to) {
        to.split(",").forEach((addr) => participantSet.add(addr.replace(/<.*>/, "").trim()));
      }
    }

    // Build thread text for AI
    const threadText = msgs
      .map((msg) => {
        const from = getHeader(msg, "from");
        const date = getHeader(msg, "date");
        const body = extractMessageBody(msg);
        return `From: ${from}\nDate: ${date}\n\n${body}`.trim();
      })
      .join("\n\n---\n\n");

    // AI summarize
    const ai = await summarizeThread(subject, threadText);

    // Insert note
    await db.insert(emailNotesTable).values({
      propertyId,
      threadId,
      subject,
      participants: JSON.stringify(Array.from(participantSet).filter(Boolean)),
      monthYear: monthYear(rawDate),
      aiSummary: ai.summary,
      actionItems: JSON.stringify(ai.actionItems),
      keyDates: JSON.stringify(ai.keyDates),
      threadDate: rawDate,
      syncedAt: new Date(),
    });

    synced++;
  }

  return synced;
}

// ── Routes ────────────────────────────────────────────────────────────────

// GET /gmail/status
router.get("/gmail/status", async (_req, res) => {
  res.json({ connected: GMAIL_CONNECTED });
});

// GET /gmail/settings — all properties with their gmail settings
router.get("/gmail/settings", async (_req, res) => {
  const properties = await db.select().from(propertiesTable).orderBy(propertiesTable.createdAt);
  const settings = await db.select().from(gmailSettingsTable);
  const settingsMap = new Map(settings.map((s) => [s.propertyId, s]));

  const lastSyncedRows = await db
    .select({ propertyId: emailNotesTable.propertyId, syncedAt: emailNotesTable.syncedAt })
    .from(emailNotesTable)
    .orderBy(emailNotesTable.syncedAt);
  const lastSyncedMap = new Map<number, string>();
  for (const row of lastSyncedRows) {
    lastSyncedMap.set(row.propertyId, row.syncedAt.toISOString());
  }

  res.json(
    properties.map((p) => ({
      propertyId: p.id,
      propertyName: p.name,
      propertyAddress: p.address,
      pullMode: settingsMap.get(p.id)?.pullMode ?? "address",
      gmailLabel: settingsMap.get(p.id)?.gmailLabel ?? null,
      lastSynced: lastSyncedMap.get(p.id) ?? null,
    }))
  );
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

  const propertyId = Number(req.params.propertyId);
  const [property] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, propertyId));
  if (!property) {
    res.status(404).json({ error: "Property not found" });
    return;
  }

  const [setting] = await db.select().from(gmailSettingsTable).where(eq(gmailSettingsTable.propertyId, propertyId));
  const pullMode = setting?.pullMode ?? "address";
  const gmailLabel = setting?.gmailLabel ?? null;

  try {
    const synced = await syncProperty(propertyId, pullMode, gmailLabel, property.address);
    res.json({ synced, propertyId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    res.status(500).json({ error: msg });
  }
});

// POST /gmail/sync — sync all properties
router.post("/gmail/sync", async (_req, res) => {
  if (!GMAIL_CONNECTED) {
    res.status(503).json({ error: "Gmail not connected" });
    return;
  }

  const properties = await db.select().from(propertiesTable);
  const settings = await db.select().from(gmailSettingsTable);
  const settingsMap = new Map(settings.map((s) => [s.propertyId, s]));

  let totalSynced = 0;
  for (const p of properties) {
    const setting = settingsMap.get(p.id);
    try {
      const synced = await syncProperty(
        p.id,
        setting?.pullMode ?? "address",
        setting?.gmailLabel ?? null,
        p.address
      );
      totalSynced += synced;
    } catch {
      // continue with other properties if one fails
    }
  }

  res.json({ synced: totalSynced });
});

// GET /gmail/notes/:propertyId — notes grouped by month, newest first
router.get("/gmail/notes/:propertyId", async (req, res) => {
  const propertyId = Number(req.params.propertyId);

  const notes = await db
    .select()
    .from(emailNotesTable)
    .where(eq(emailNotesTable.propertyId, propertyId))
    .orderBy(emailNotesTable.threadDate);

  const byMonth: Record<string, typeof notes> = {};
  for (const note of notes) {
    if (!byMonth[note.monthYear]) byMonth[note.monthYear] = [];
    byMonth[note.monthYear].push(note);
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
