import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { propertiesTable, emailNotesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { buildAmortizationSchedule } from "../routes/payments";

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
    totalValueFormatted: string;
    totalEquityFormatted: string;
    totalDebtFormatted: string;
    avgLtv: number;
    monthlyPIFormatted: string;
    netCashFlowFormatted: string;
    netCashFlowPositive: boolean;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function fmtFull(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// ── AI content generation ─────────────────────────────────────────────────

export async function generateDigest(userId: string, firstName: string): Promise<DigestContent> {
  const properties = await db.select().from(propertiesTable);

  const today = new Date();
  const [startYear5, startYear10] = [
    today.getFullYear() + 5,
    today.getFullYear() + 10,
  ];

  let totalValue = 0;
  let totalEquity = 0;
  let totalDebt = 0;
  let totalMonthlyPI = 0;
  let totalRent = 0;
  let totalTaxes = 0;
  let totalInsurance = 0;

  const propLines: string[] = [];

  for (const p of properties) {
    const currentValue = Number(p.currentValue ?? p.purchasePrice);
    const purchasePrice = Number(p.purchasePrice);
    const monthlyPayment = Number(p.monthlyPayment ?? 0);
    const rent = Number(p.monthlyRent ?? 0);
    const taxes = Number(p.monthlyTaxes ?? 0);
    const insurance = Number(p.monthlyInsurance ?? 0);

    // Build amortization to get current balance and payoff date
    let currentBalance = Number(p.loanAmount ?? 0);
    let payoffDate: string | undefined;

    if (p.loanAmount && p.interestRate && p.loanTermYears && p.loanStartDate) {
      const schedule = buildAmortizationSchedule({
        loanAmount: Number(p.loanAmount),
        interestRate: Number(p.interestRate),
        loanTermYears: p.loanTermYears,
        loanStartDate: p.loanStartDate,
        monthlyPayment,
        extraPaymentMonthly: p.savedExtraMonthly != null ? Number(p.savedExtraMonthly) : 0,
        extraPayments: (p.savedExtraPayments as Array<{ paymentNumber: number; amount: number }> | null) ?? [],
        startingBalance: p.currentLoanBalance != null ? Number(p.currentLoanBalance) : undefined,
      });

      const lastRow = schedule[schedule.length - 1];
      payoffDate = lastRow?.paymentDate;

      // Current balance: find the row matching today
      const [sy, sm] = p.loanStartDate.split("-").map(Number);
      const monthsElapsed = Math.max(0,
        (today.getFullYear() - sy) * 12 + (today.getMonth() + 1 - sm)
      );
      const currentRow = schedule[Math.min(monthsElapsed, schedule.length) - 1];
      if (currentRow) currentBalance = currentRow.remainingBalance;

      // 5yr equity projection
      const months5 = monthsElapsed + 60;
      const row5 = schedule[Math.min(months5, schedule.length) - 1];
      const equity5 = currentValue - (row5 ? row5.remainingBalance : 0);

      // 10yr equity projection
      const months10 = monthsElapsed + 120;
      const row10 = schedule[Math.min(months10, schedule.length) - 1];
      const equity10 = currentValue - (row10 ? row10.remainingBalance : 0);

      const equity = currentValue - currentBalance;
      const ltv = currentValue > 0 ? (currentBalance / currentValue) * 100 : 0;
      const appreciation = currentValue - purchasePrice;
      const appreciationPct = purchasePrice > 0 ? (appreciation / purchasePrice) * 100 : 0;
      const netMonthly = rent - monthlyPayment - taxes - insurance;

      propLines.push(
        `- ${p.name} (${p.address}):` +
        ` value ${fmt(currentValue)}, equity ${fmt(equity)}, debt ${fmt(currentBalance)}, LTV ${ltv.toFixed(0)}%` +
        (appreciation !== 0 ? `, appreciation ${fmt(appreciation)} (${appreciationPct.toFixed(1)}% since ${p.yearBought})` : "") +
        `, monthly P&I ${fmt(monthlyPayment)}` +
        (rent > 0 ? `, rent ${fmt(rent)}, net cash flow ${fmt(netMonthly)}/mo` : "") +
        (taxes > 0 || insurance > 0 ? `, taxes+ins ${fmt(taxes + insurance)}/mo` : "") +
        (payoffDate ? `, payoff ${payoffDate}` : "") +
        `, equity in 5yr: ${fmt(equity5)}, in 10yr: ${fmt(equity10)}`
      );
    } else {
      const equity = currentValue - currentBalance;
      const ltv = currentValue > 0 ? (currentBalance / currentValue) * 100 : 0;
      propLines.push(
        `- ${p.name} (${p.address}): value ${fmt(currentValue)}, equity ${fmt(equity)}, LTV ${ltv.toFixed(0)}%`
      );
    }

    totalValue += currentValue;
    totalEquity += currentValue - currentBalance;
    totalDebt += currentBalance;
    totalMonthlyPI += monthlyPayment;
    totalRent += rent;
    totalTaxes += taxes;
    totalInsurance += insurance;
  }

  const avgLtv = totalValue > 0 ? (totalDebt / totalValue) * 100 : 0;
  const netCashFlow = totalRent - totalMonthlyPI - totalTaxes - totalInsurance;

  // Recent email notes
  const notes = await db
    .select({ subject: emailNotesTable.subject, aiSummary: emailNotesTable.aiSummary, actionItems: emailNotesTable.actionItems })
    .from(emailNotesTable)
    .where(eq(emailNotesTable.userId, userId));

  const notesContext =
    notes.length > 0
      ? notes.slice(0, 8).map((n) => `Email: "${n.subject}" — ${n.aiSummary}`).join("\n")
      : "No recent email communications synced.";

  const month = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
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
Be specific — use actual numbers from the data. Highlights and watch items should draw on cash flow, appreciation, payoff timelines, projections, and email communications where relevant. Avoid generic platitudes. Sound like a trusted advisor, not a robot.`,
      },
      {
        role: "user",
        content: `Portfolio owner: ${firstName}
Month: ${month}
Total properties: ${properties.length}
Total portfolio value: ${fmtFull(totalValue)}
Total equity: ${fmtFull(totalEquity)}
Total mortgage debt: ${fmtFull(totalDebt)}
Portfolio LTV: ${avgLtv.toFixed(1)}%
Total monthly P&I: ${fmtFull(totalMonthlyPI)}
Total monthly rent collected: ${fmtFull(totalRent)}
Total monthly taxes + insurance: ${fmtFull(totalTaxes + totalInsurance)}
Net monthly cash flow (rent − P&I − taxes − insurance): ${fmtFull(netCashFlow)} ${netCashFlow >= 0 ? "(positive)" : "(negative — expenses exceed rent)"}

Per-property detail:
${propLines.join("\n") || "No properties added yet."}

Recent email communications:
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
      totalValueFormatted: fmt(totalValue),
      totalEquityFormatted: fmt(totalEquity),
      totalDebtFormatted: fmt(totalDebt),
      avgLtv: Math.round(avgLtv),
      monthlyPIFormatted: fmt(totalMonthlyPI),
      netCashFlowFormatted: fmt(netCashFlow),
      netCashFlowPositive: netCashFlow >= 0,
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

  const cashFlowColor = content.stats.netCashFlowPositive ? "#d1fae5" : "#fee2e2";
  const cashFlowTextColor = content.stats.netCashFlowPositive ? "#fff" : "#fff";
  const cashFlowLabel = content.stats.netCashFlowPositive ? "Net Cash Flow ✓" : "Net Cash Flow ↓";

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
      <!-- Stats bar — row 1 -->
      <tr>
        <td style="background:#f97316;padding:16px 32px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:0 12px 0 0;">
                <p style="margin:0;color:#fff;font-size:11px;font-weight:600;opacity:.8;text-transform:uppercase;letter-spacing:.05em;">Properties</p>
                <p style="margin:4px 0 0;color:#fff;font-size:20px;font-weight:700;">${content.stats.totalProperties}</p>
              </td>
              <td align="center" style="padding:0 12px;border-left:1px solid rgba(255,255,255,0.3);">
                <p style="margin:0;color:#fff;font-size:11px;font-weight:600;opacity:.8;text-transform:uppercase;letter-spacing:.05em;">Total Value</p>
                <p style="margin:4px 0 0;color:#fff;font-size:20px;font-weight:700;">${content.stats.totalValueFormatted}</p>
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
      <!-- Stats bar — row 2: cash flow -->
      <tr>
        <td style="background:#ea580c;padding:8px 32px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:0 12px 0 0;">
                <p style="margin:0;color:#fff;font-size:11px;font-weight:600;opacity:.8;text-transform:uppercase;letter-spacing:.05em;">Monthly P&amp;I</p>
                <p style="margin:4px 0 0;color:#fff;font-size:18px;font-weight:700;">${content.stats.monthlyPIFormatted}</p>
              </td>
              <td align="center" style="padding:0 0 0 12px;border-left:1px solid rgba(255,255,255,0.3);">
                <p style="margin:0;color:#fff;font-size:11px;font-weight:600;opacity:.8;text-transform:uppercase;letter-spacing:.05em;">${cashFlowLabel}</p>
                <p style="margin:4px 0 0;color:#fff;font-size:18px;font-weight:700;">${content.stats.netCashFlowFormatted}/mo</p>
              </td>
              <td align="center" style="padding:0 0 0 12px;border-left:1px solid rgba(255,255,255,0.3);">
                <p style="margin:0;color:#fff;font-size:11px;font-weight:600;opacity:.8;text-transform:uppercase;letter-spacing:.05em;">Total Debt</p>
                <p style="margin:4px 0 0;color:#fff;font-size:18px;font-weight:700;">${content.stats.totalDebtFormatted}</p>
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
    `Portfolio: ${content.stats.totalProperties} properties | Value: ${content.stats.totalValueFormatted} | Equity: ${content.stats.totalEquityFormatted} | LTV: ${content.stats.avgLtv}%`,
    `Monthly P&I: ${content.stats.monthlyPIFormatted} | Net Cash Flow: ${content.stats.netCashFlowFormatted}/mo | Total Debt: ${content.stats.totalDebtFormatted}`,
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

export function buildRawEmail(to: string, subject: string, html: string, text: string): string {
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
