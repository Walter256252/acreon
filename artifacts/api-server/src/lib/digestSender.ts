import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { propertiesTable, emailNotesTable } from "@workspace/db";
import { eq, gte } from "drizzle-orm";
import { ReplitConnectors } from "@replit/connectors-sdk";

// ── Types ─────────────────────────────────────────────────────────────────

export interface DigestHighlight {
  title: string;
  description: string;
}

export interface DigestContent {
  greeting: string;
  portfolioSummary: string;
  highlights: DigestHighlight[];
  watchItems: DigestHighlight[];
  closingLine: string;
  stats: {
    totalProperties: number;
    totalEquityFormatted: string;
    totalDebtFormatted: string;
    avgLtv: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function monthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  if (annualRate === 0) return principal / termMonths;
  const r = annualRate / 100 / 12;
  return (principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

function estimateEquityAndDebt(p: {
  purchasePrice: number;
  currentValue: number | null;
  loanAmount: number | null;
  interestRate: number | null;
  loanTermMonths: number | null;
  purchaseDate: string | null;
}) {
  const value = p.currentValue ?? p.purchasePrice;
  const loan = p.loanAmount ?? 0;
  if (!loan || !p.interestRate || !p.loanTermMonths || !p.purchaseDate) {
    return { equity: value - loan, debt: loan };
  }

  const start = new Date(p.purchaseDate);
  const now = new Date();
  const monthsElapsed = Math.max(
    0,
    (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth()
  );

  const r = p.interestRate / 100 / 12;
  const pmt = monthlyPayment(loan, p.interestRate, p.loanTermMonths);
  let balance = loan;
  for (let i = 0; i < Math.min(monthsElapsed, p.loanTermMonths); i++) {
    balance = balance * (1 + r) - pmt;
  }
  balance = Math.max(0, balance);
  return { equity: value - balance, debt: balance };
}

// ── AI content generation ─────────────────────────────────────────────────

export async function generateDigest(userId: string, firstName: string): Promise<DigestContent> {
  const properties = await db.select().from(propertiesTable);

  let totalEquity = 0;
  let totalDebt = 0;
  const propLines: string[] = [];

  for (const p of properties) {
    const { equity, debt } = estimateEquityAndDebt(p as Parameters<typeof estimateEquityAndDebt>[0]);
    totalEquity += equity;
    totalDebt += debt;
    const ltv = (p.currentValue ?? p.purchasePrice) > 0
      ? (debt / (p.currentValue ?? p.purchasePrice)) * 100
      : 0;
    propLines.push(
      `- ${p.name} (${p.address}): value ${fmt(p.currentValue ?? p.purchasePrice)}, equity ${fmt(equity)}, LTV ${ltv.toFixed(0)}%`
    );
  }

  const total = totalEquity + totalDebt;
  const avgLtv = total > 0 ? (totalDebt / total) * 100 : 0;

  // Recent email notes (last 60 days)
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const notes = await db
    .select({ subject: emailNotesTable.subject, aiSummary: emailNotesTable.aiSummary, actionItems: emailNotesTable.actionItems })
    .from(emailNotesTable)
    .where(eq(emailNotesTable.userId, userId));
  const recentNotes = notes.filter((n) => true); // all notes for context

  const notesContext =
    recentNotes.length > 0
      ? recentNotes.slice(0, 8).map((n) => `Email: "${n.subject}" — ${n.aiSummary}`).join("\n")
      : "No recent email communications synced.";

  const month = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a friendly, expert real estate portfolio advisor. Write a monthly portfolio digest for ${month}.
Return JSON only — no markdown:
{
  "greeting": "Hi ${firstName},",
  "portfolioSummary": "2–3 warm, specific sentences summarizing the portfolio state and momentum",
  "highlights": [
    {"title": "Short punchy title (4–6 words)", "description": "1–2 sentences with a specific insight or win"},
    {"title": "Short punchy title (4–6 words)", "description": "1–2 sentences with a specific insight or win"}
  ],
  "watchItems": [
    {"title": "Short punchy title (4–6 words)", "description": "1–2 sentences with a specific, actionable concern"},
    {"title": "Short punchy title (4–6 words)", "description": "1–2 sentences with a specific, actionable concern"}
  ],
  "closingLine": "One encouraging, forward-looking sentence."
}
Be specific — use actual numbers from the data. Avoid generic platitudes. Sound like a trusted advisor, not a robot.`,
      },
      {
        role: "user",
        content: `Portfolio owner: ${firstName}
Month: ${month}
Total properties: ${properties.length}
Total equity: ${fmt(totalEquity)}
Total mortgage debt: ${fmt(totalDebt)}
Portfolio LTV: ${avgLtv.toFixed(1)}%

Properties:
${propLines.join("\n") || "No properties added yet."}

Recent communications:
${notesContext}`,
      },
    ],
  });

  let parsed: Partial<DigestContent> = {};
  try {
    parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
  } catch { /* fall through to defaults */ }

  return {
    greeting: typeof parsed.greeting === "string" ? parsed.greeting : `Hi ${firstName},`,
    portfolioSummary: typeof parsed.portfolioSummary === "string" ? parsed.portfolioSummary : "",
    highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
    watchItems: Array.isArray(parsed.watchItems) ? parsed.watchItems : [],
    closingLine: typeof parsed.closingLine === "string" ? parsed.closingLine : "",
    stats: {
      totalProperties: properties.length,
      totalEquityFormatted: fmt(totalEquity),
      totalDebtFormatted: fmt(totalDebt),
      avgLtv: Math.round(avgLtv),
    },
  };
}

// ── Email rendering ───────────────────────────────────────────────────────

function renderHtml(content: DigestContent, month: string): string {
  const highlightRows = content.highlights
    .map(
      (h) => `
    <tr>
      <td style="padding:6px 0 6px 14px;border-left:3px solid #16a34a;">
        <p style="margin:0 0 2px;font-weight:600;color:#14532d;font-size:14px;">${h.title}</p>
        <p style="margin:0;color:#166534;font-size:13px;line-height:1.5;">${h.description}</p>
      </td>
    </tr>`
    )
    .join("");

  const watchRows = content.watchItems
    .map(
      (w) => `
    <tr>
      <td style="padding:6px 0 6px 14px;border-left:3px solid #d97706;">
        <p style="margin:0 0 2px;font-weight:600;color:#92400e;font-size:14px;">${w.title}</p>
        <p style="margin:0;color:#78350f;font-size:13px;line-height:1.5;">${w.description}</p>
      </td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <!-- Header -->
      <tr>
        <td style="background:#1c1917;padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin:0;color:#f97316;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${month} Update</p>
                <p style="margin:4px 0 0;color:#fff;font-size:22px;font-weight:700;">Your RealTrack Portfolio</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Stats bar -->
      <tr>
        <td style="background:#f97316;padding:16px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:0 12px 0 0;">
                <p style="margin:0;color:#fff;font-size:11px;font-weight:600;opacity:.8;text-transform:uppercase;letter-spacing:.05em;">Properties</p>
                <p style="margin:4px 0 0;color:#fff;font-size:20px;font-weight:700;">${content.stats.totalProperties}</p>
              </td>
              <td align="center" style="padding:0 12px;border-left:1px solid rgba(255,255,255,0.3);">
                <p style="margin:0;color:#fff;font-size:11px;font-weight:600;opacity:.8;text-transform:uppercase;letter-spacing:.05em;">Total Equity</p>
                <p style="margin:4px 0 0;color:#fff;font-size:20px;font-weight:700;">${content.stats.totalEquityFormatted}</p>
              </td>
              <td align="center" style="padding:0 0 0 12px;border-left:1px solid rgba(255,255,255,0.3);">
                <p style="margin:0;color:#fff;font-size:11px;font-weight:600;opacity:.8;text-transform:uppercase;letter-spacing:.05em;">Avg LTV</p>
                <p style="margin:4px 0 0;color:#fff;font-size:20px;font-weight:700;">${content.stats.avgLtv}%</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Body -->
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 8px;color:#111827;font-size:15px;">${content.greeting}</p>
          <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.7;">${content.portfolioSummary}</p>

          <!-- Highlights -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;padding:16px;margin-bottom:16px;">
            <tr><td style="padding:0 0 10px;">
              <p style="margin:0;font-weight:700;color:#14532d;font-size:13px;">✅ &nbsp;GREAT THINGS GOING ON</p>
            </td></tr>
            ${highlightRows}
          </table>

          <!-- Watch items -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:8px;padding:16px;margin-bottom:24px;">
            <tr><td style="padding:0 0 10px;">
              <p style="margin:0;font-weight:700;color:#92400e;font-size:13px;">👁 &nbsp;KEEP AN EYE ON</p>
            </td></tr>
            ${watchRows}
          </table>

          <p style="margin:0 0 28px;color:#374151;font-size:14px;line-height:1.7;">${content.closingLine}</p>

          <!-- CTA -->
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#f97316;border-radius:8px;padding:12px 24px;">
                <a href="#" style="color:#fff;text-decoration:none;font-weight:600;font-size:14px;">View My Full Portfolio →</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Footer -->
      <tr>
        <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">You're receiving this because you enabled monthly digests in RealTrack. <a href="#" style="color:#6b7280;">Manage preferences</a></p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function renderText(content: DigestContent, month: string): string {
  const lines = [
    `RealTrack Portfolio Update — ${month}`,
    "=".repeat(50),
    "",
    content.greeting,
    "",
    content.portfolioSummary,
    "",
    `Portfolio: ${content.stats.totalProperties} properties | Equity: ${content.stats.totalEquityFormatted} | LTV: ${content.stats.avgLtv}%`,
    "",
    "✅ GREAT THINGS GOING ON",
    ...content.highlights.map((h) => `  • ${h.title}: ${h.description}`),
    "",
    "👁 KEEP AN EYE ON",
    ...content.watchItems.map((w) => `  • ${w.title}: ${w.description}`),
    "",
    content.closingLine,
    "",
    "—",
    "RealTrack · Manage your email preferences in Settings.",
  ];
  return lines.join("\n");
}

function buildRawEmail(to: string, subject: string, html: string, text: string): string {
  const boundary = `rt_${Date.now()}`;
  const msg = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    "",
    text,
    "",
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    "",
    html,
    "",
    `--${boundary}--`,
  ].join("\r\n");
  return Buffer.from(msg).toString("base64url");
}

// ── Public send function ──────────────────────────────────────────────────

export async function sendMonthlyDigest(
  toEmail: string,
  content: DigestContent
): Promise<void> {
  const month = new Date().toLocaleString("default", { month: "long", year: "numeric" });
  const subject = `Your RealTrack Portfolio Update — ${month}`;
  const html = renderHtml(content, month);
  const text = renderText(content, month);

  const connectors = new ReplitConnectors();
  await (connectors.gmail as { request: (opts: { method: string; path: string; body?: unknown }) => Promise<unknown> }).request({
    method: "POST",
    path: "/gmail/v1/users/me/messages/send",
    body: { raw: buildRawEmail(toEmail, subject, html, text) },
  });
}
