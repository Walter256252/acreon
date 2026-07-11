import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { emailNotesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export interface ImapCredentials {
  host: string;
  port: number;
  email: string;
  password: string;
  tls: boolean;
}

function makeClient(creds: ImapCredentials) {
  return new ImapFlow({
    host: creds.host,
    port: creds.port,
    secure: creds.tls,
    auth: { user: creds.email, pass: creds.password },
    logger: false,
    // Generous timeouts for first-time connections
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  });
}

/** Test credentials — throws a descriptive error on failure. */
export async function testConnection(creds: ImapCredentials): Promise<void> {
  const client = makeClient(creds);
  await client.connect();
  await client.logout();
}

function toMonthYear(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

interface AISummary {
  summary: string;
  actionItems: string[];
  keyDates: { date: string; description: string }[];
}

async function summarise(subject: string, body: string, from: string): Promise<AISummary> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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
    const p = JSON.parse(res.choices[0].message.content ?? "{}");
    return {
      summary: typeof p.summary === "string" ? p.summary : "No summary available.",
      actionItems: Array.isArray(p.actionItems) ? p.actionItems : [],
      keyDates: Array.isArray(p.keyDates) ? p.keyDates : [],
    };
  } catch {
    return { summary: "Could not summarize this email.", actionItems: [], keyDates: [] };
  }
}

/**
 * Sync emails for one property via IMAP.
 * Returns the number of new notes stored.
 */
export async function syncPropertyEmails(
  creds: ImapCredentials,
  propertyId: number,
  userId: string,
  pullMode: string,
  folderName: string | null,
  address: string,
): Promise<number> {
  // Load already-synced IDs to avoid duplicates
  const existing = await db
    .select({ threadId: emailNotesTable.threadId })
    .from(emailNotesTable)
    .where(and(eq(emailNotesTable.propertyId, propertyId), eq(emailNotesTable.userId, userId)));
  const existingIds = new Set(existing.map((r) => r.threadId));

  const client = makeClient(creds);
  let synced = 0;

  await client.connect();

  // Determine which mailbox to open
  const mailbox =
    pullMode === "label" && folderName ? folderName : "INBOX";

  const lock = await client.getMailboxLock(mailbox);
  try {
    // Build IMAP search criteria
    let criteria: Record<string, unknown>;
    if (pullMode === "address") {
      // Search by the street part of the address (e.g. "142 Main St")
      const street = address.split(",")[0].trim();
      criteria = { text: street };
    } else {
      // Folder mode — fetch all messages in that folder
      criteria = { all: true };
    }

    const uids = await client.search(criteria, { uid: true });
    if (uids.length === 0) return 0;

    // Process up to 50 newest messages
    const batch = uids.slice(-50);

    for await (const msg of client.fetch(batch, { source: true, envelope: true, uid: true })) {
      const msgId = `${mailbox}:${msg.uid}`;
      if (existingIds.has(msgId) || !msg.source) continue;

      // Parse the raw RFC822 message
      const parsed = await simpleParser(msg.source);

      const subject = parsed.subject ?? msg.envelope?.subject ?? "(no subject)";
      const body = parsed.text ?? "";
      const date = parsed.date ?? new Date();
      const from = parsed.from?.text ?? "";

      // Collect participants (max 8)
      const participants = new Set<string>();
      parsed.from?.value?.forEach((a) => participants.add(a.name || a.address || ""));
      const toField = parsed.to;
      if (toField) {
        const arr = Array.isArray(toField) ? toField : [toField];
        arr.forEach((af) =>
          af.value?.forEach((a) => participants.add(a.name || a.address || ""))
        );
      }

      const ai = await summarise(subject, body, from);

      await db.insert(emailNotesTable).values({
        propertyId,
        userId,
        threadId: msgId,
        subject,
        participants: JSON.stringify([...participants].filter(Boolean).slice(0, 8)),
        monthYear: toMonthYear(date),
        aiSummary: ai.summary,
        actionItems: JSON.stringify(ai.actionItems),
        keyDates: JSON.stringify(ai.keyDates),
        threadDate: date,
        syncedAt: new Date(),
      });

      existingIds.add(msgId);
      synced++;
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return synced;
}
