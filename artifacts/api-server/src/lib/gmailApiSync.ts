/**
 * Gmail API sync — fetches emails via Google's REST API using per-user OAuth tokens.
 * Mirrors the interface of imapSync.ts so the email routes can use both interchangeably.
 */

import { db } from "@workspace/db";
import { emailConnectionsTable, emailNotesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

// ── Types ─────────────────────────────────────────────────────────────────

interface GmailMessageListResponse {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
}

interface GmailBodyPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailBodyPart[];
  headers?: { name: string; value: string }[];
}

interface GmailMessage {
  id: string;
  payload?: GmailBodyPart;
  internalDate?: string;
}

interface TokenRefreshResponse {
  access_token: string;
  expires_in: number;
  error?: string;
}

interface AISummary {
  summary: string;
  actionItems: string[];
  keyDates: { date: string; description: string }[];
}

// ── Token refresh ─────────────────────────────────────────────────────────

/** Returns a valid access token, refreshing it if it expires within 5 minutes. */
export async function getValidAccessToken(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiry: Date,
): Promise<string> {
  const bufferMs = 5 * 60 * 1000;
  if (expiry.getTime() - Date.now() > bufferMs) {
    return accessToken;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = (await res.json()) as TokenRefreshResponse;
  if (!res.ok || data.error) {
    throw new Error(`Token refresh failed: ${data.error ?? res.statusText}`);
  }

  const newExpiry = new Date(Date.now() + data.expires_in * 1000);
  await db
    .update(emailConnectionsTable)
    .set({ gmailAccessToken: data.access_token, gmailTokenExpiry: newExpiry, updatedAt: new Date() })
    .where(eq(emailConnectionsTable.userId, userId));

  return data.access_token;
}

// ── Message parsing ───────────────────────────────────────────────────────

function getHeader(headers: { name: string; value: string }[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractText(part: GmailBodyPart): string {
  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf-8");
  }
  if (part.parts) {
    for (const child of part.parts) {
      const text = extractText(child);
      if (text) return text;
    }
  }
  return "";
}

// ── AI summarisation ──────────────────────────────────────────────────────

async function summarise(subject: string, body: string, from: string): Promise<AISummary> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a real estate property management assistant. Summarize the email and extract action items and key dates.
Return JSON only:
{"summary":"2-3 sentence plain-English summary","actionItems":["..."],"keyDates":[{"date":"Month DD, YYYY","description":"what happens"}]}
Keep arrays empty [] if nothing found.`,
        },
        {
          role: "user",
          content: `From: ${from}\nSubject: ${subject}\n\n${body.slice(0, 4000)}`,
        },
      ],
    });
    const p = JSON.parse(res.choices[0].message.content ?? "{}") as Partial<AISummary>;
    return {
      summary: typeof p.summary === "string" ? p.summary : "No summary available.",
      actionItems: Array.isArray(p.actionItems) ? p.actionItems : [],
      keyDates: Array.isArray(p.keyDates) ? p.keyDates : [],
    };
  } catch {
    return { summary: "Could not summarize this email.", actionItems: [], keyDates: [] };
  }
}

function toMonthYear(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// ── Main sync function ────────────────────────────────────────────────────

/**
 * Sync emails for one property via the Gmail API.
 * Returns the number of new notes stored.
 */
export async function syncPropertyEmailsViaGmail(
  userId: string,
  accessToken: string,
  refreshToken: string,
  tokenExpiry: Date,
  propertyId: number,
  pullMode: string,
  folderName: string | null,
  address: string,
): Promise<number> {
  const token = await getValidAccessToken(userId, accessToken, refreshToken, tokenExpiry);

  const headers = { Authorization: `Bearer ${token}` };

  // Build Gmail search query
  let query: string;
  if (pullMode === "label" && folderName) {
    query = `label:${folderName.replace(/\s+/g, "-")}`;
  } else {
    const street = address.split(",")[0].trim();
    query = `"${street}"`;
  }

  // Fetch message IDs (up to 50 newest)
  const listUrl = new URL("https://www.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", query);
  listUrl.searchParams.set("maxResults", "50");

  const listRes = await fetch(listUrl.toString(), { headers });
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.statusText}`);
  const listData = (await listRes.json()) as GmailMessageListResponse;

  const messageIds = listData.messages ?? [];
  if (messageIds.length === 0) return 0;

  // Load already-synced IDs to avoid duplicates
  const existing = await db
    .select({ threadId: emailNotesTable.threadId })
    .from(emailNotesTable)
    .where(and(eq(emailNotesTable.propertyId, propertyId), eq(emailNotesTable.userId, userId)));
  const existingIds = new Set(existing.map((r) => r.threadId));

  let synced = 0;

  for (const { id } of messageIds) {
    const msgKey = `gmail:${id}`;
    if (existingIds.has(msgKey)) continue;

    const msgRes = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers },
    );
    if (!msgRes.ok) continue;

    const msg = (await msgRes.json()) as GmailMessage;
    const payload = msg.payload;
    if (!payload) continue;

    const msgHeaders = payload.headers ?? [];
    const subject = getHeader(msgHeaders, "Subject") || "(no subject)";
    const from = getHeader(msgHeaders, "From");
    const to = getHeader(msgHeaders, "To");
    const dateStr = getHeader(msgHeaders, "Date");
    const body = extractText(payload);

    const date = dateStr ? new Date(dateStr) : new Date(Number(msg.internalDate));

    // Collect participants
    const participants = new Set<string>();
    [from, to].forEach((field) => {
      if (field) {
        // Extract names/emails from "Name <email>" or plain email format
        field.split(",").forEach((part) => {
          const nameMatch = part.match(/^([^<]+)</);
          const emailMatch = part.match(/<([^>]+)>/);
          participants.add((nameMatch?.[1]?.trim() || emailMatch?.[1]?.trim() || part.trim()));
        });
      }
    });

    const ai = await summarise(subject, body, from);

    await db.insert(emailNotesTable).values({
      propertyId,
      userId,
      threadId: msgKey,
      subject,
      participants: JSON.stringify([...participants].filter(Boolean).slice(0, 8)),
      monthYear: toMonthYear(isNaN(date.getTime()) ? new Date() : date),
      aiSummary: ai.summary,
      actionItems: JSON.stringify(ai.actionItems),
      keyDates: JSON.stringify(ai.keyDates),
      threadDate: isNaN(date.getTime()) ? new Date() : date,
      syncedAt: new Date(),
    });

    existingIds.add(msgKey);
    synced++;
  }

  return synced;
}
