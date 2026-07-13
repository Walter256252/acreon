import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { finTransactionsTable, propertiesTable } from "@workspace/db";
import { eq, and, gte, lte, desc, asc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

function uid(req: Parameters<typeof getAuth>[0]) {
  return getAuth(req).userId!;
}

// ── Validation ────────────────────────────────────────────────────────────

const VALID_TYPES = new Set([
  "income", "expense", "loan_payment", "owner_contribution", "owner_draw", "capital_improvement",
]);

interface TxInput {
  propertyId?: number | null;
  date?: string;
  description?: string;
  amount?: number;
  type?: string;
  category?: string;
  vendorPayer?: string | null;
  paymentAccount?: string | null;
  notes?: string | null;
  rentalType?: string | null;
  taxYear?: number | null;
  isReviewed?: boolean;
}

function parseTxBody(body: unknown, requireAll = true): TxInput {
  const b = body as Record<string, unknown>;
  if (requireAll) {
    if (!b.date || typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date))
      throw new Error("Invalid date");
    if (!b.description || typeof b.description !== "string")
      throw new Error("Description required");
    if (typeof b.amount !== "number" || b.amount <= 0)
      throw new Error("Amount must be a positive number");
    if (!b.type || !VALID_TYPES.has(b.type as string))
      throw new Error("Invalid type");
    if (!b.category || typeof b.category !== "string")
      throw new Error("Category required");
  }
  return {
    propertyId: b.propertyId != null ? Number(b.propertyId) : null,
    date: b.date as string | undefined,
    description: b.description as string | undefined,
    amount: b.amount != null ? Number(b.amount) : undefined,
    type: b.type as string | undefined,
    category: b.category as string | undefined,
    vendorPayer: b.vendorPayer != null ? String(b.vendorPayer) : null,
    paymentAccount: b.paymentAccount != null ? String(b.paymentAccount) : null,
    notes: b.notes != null ? String(b.notes) : null,
    rentalType: b.rentalType != null && b.rentalType !== "" ? String(b.rentalType) : null,
    taxYear: b.taxYear != null ? Number(b.taxYear) : null,
    isReviewed: typeof b.isReviewed === "boolean" ? b.isReviewed : undefined,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toApiTx(row: typeof finTransactionsTable.$inferSelect) {
  return {
    id: row.id,
    propertyId: row.propertyId,
    date: row.date,
    description: row.description,
    amount: parseFloat(String(row.amount)),
    type: row.type,
    category: row.category,
    vendorPayer: row.vendorPayer,
    paymentAccount: row.paymentAccount,
    notes: row.notes,
    rentalType: row.rentalType,
    taxYear: row.taxYear,
    isReviewed: row.isReviewed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── GET /api/finances/transactions ────────────────────────────────────────
router.get("/finances/transactions", async (req, res) => {
  const userId = uid(req);
  const { propertyId, type, dateFrom, dateTo, taxYear, isReviewed, rentalType } =
    req.query as Record<string, string | undefined>;

  const conditions = [eq(finTransactionsTable.clerkUserId, userId)];

  if (propertyId) conditions.push(eq(finTransactionsTable.propertyId, parseInt(propertyId)));
  if (type) conditions.push(eq(finTransactionsTable.type, type));
  if (dateFrom) conditions.push(gte(finTransactionsTable.date, dateFrom));
  if (dateTo) conditions.push(lte(finTransactionsTable.date, dateTo));
  if (taxYear) conditions.push(eq(finTransactionsTable.taxYear, parseInt(taxYear)));
  if (isReviewed !== undefined)
    conditions.push(eq(finTransactionsTable.isReviewed, isReviewed === "true"));
  if (rentalType) conditions.push(eq(finTransactionsTable.rentalType, rentalType));

  const rows = await db
    .select()
    .from(finTransactionsTable)
    .where(and(...conditions))
    .orderBy(desc(finTransactionsTable.date), desc(finTransactionsTable.createdAt));

  res.json(rows.map(toApiTx));
});

// ── POST /api/finances/transactions ───────────────────────────────────────
router.post("/finances/transactions", async (req, res) => {
  const userId = uid(req);
  let body: TxInput;
  try { body = parseTxBody(req.body, true); } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Invalid input" }); return;
  }

  // Verify property belongs to this user if provided
  if (body.propertyId) {
    const prop = await db
      .select({ id: propertiesTable.id })
      .from(propertiesTable)
      .where(
        and(
          eq(propertiesTable.id, body.propertyId),
          eq(propertiesTable.clerkUserId, userId),
        ),
      )
      .limit(1);
    if (!prop.length) {
      res.status(403).json({ error: "Property not found or access denied" });
      return;
    }
  }

  const taxYearVal = body.taxYear ?? parseInt(body.date!.slice(0, 4));

  const [row] = await db
    .insert(finTransactionsTable)
    .values({
      clerkUserId: userId,
      propertyId: body.propertyId ?? null,
      date: body.date!,
      description: body.description!,
      amount: String(body.amount),
      type: body.type!,
      category: body.category!,
      vendorPayer: body.vendorPayer ?? null,
      paymentAccount: body.paymentAccount ?? null,
      notes: body.notes ?? null,
      rentalType: body.rentalType ?? null,
      taxYear: taxYearVal,
      isReviewed: body.isReviewed ?? false,
    })
    .returning();

  res.status(201).json(toApiTx(row));
});

// ── POST /api/finances/transactions/bulk ──────────────────────────────────
// Create multiple transactions at once (used for recurring payments).
router.post("/finances/transactions/bulk", async (req, res) => {
  const userId = uid(req);
  const { transactions } = req.body as { transactions: unknown[] };

  if (!Array.isArray(transactions) || transactions.length === 0) {
    res.status(400).json({ error: "transactions must be a non-empty array" });
    return;
  }
  if (transactions.length > 60) {
    res.status(400).json({ error: "Cannot create more than 60 transactions at once" });
    return;
  }

  // Parse and validate every item up front
  const parsed: TxInput[] = [];
  for (let i = 0; i < transactions.length; i++) {
    try {
      parsed.push(parseTxBody(transactions[i], true));
    } catch (e: unknown) {
      res.status(400).json({ error: `Item ${i}: ${e instanceof Error ? e.message : "Invalid input"}` });
      return;
    }
  }

  // Verify any referenced property IDs belong to this user
  const propIds = [...new Set(parsed.map(b => b.propertyId).filter(Boolean) as number[])];
  if (propIds.length > 0) {
    const ownedProps = await db
      .select({ id: propertiesTable.id })
      .from(propertiesTable)
      .where(and(eq(propertiesTable.clerkUserId, userId)));
    const ownedSet = new Set(ownedProps.map(p => p.id));
    for (const pid of propIds) {
      if (!ownedSet.has(pid)) {
        res.status(403).json({ error: `Property ${pid} not found or access denied` });
        return;
      }
    }
  }

  const rows = await db
    .insert(finTransactionsTable)
    .values(
      parsed.map(body => ({
        clerkUserId: userId,
        propertyId: body.propertyId ?? null,
        date: body.date!,
        description: body.description!,
        amount: String(body.amount),
        type: body.type!,
        category: body.category!,
        vendorPayer: body.vendorPayer ?? null,
        paymentAccount: body.paymentAccount ?? null,
        notes: body.notes ?? null,
        rentalType: body.rentalType ?? null,
        taxYear: body.taxYear ?? parseInt(body.date!.slice(0, 4)),
        isReviewed: body.isReviewed ?? false,
      })),
    )
    .returning();

  res.status(201).json(rows.map(toApiTx));
});

// ── PUT /api/finances/transactions/:id ────────────────────────────────────
router.put("/finances/transactions/:id", async (req, res) => {
  const userId = uid(req);
  const id = parseInt(req.params.id);
  let body: TxInput;
  try { body = parseTxBody(req.body, false); } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Invalid input" }); return;
  }

  // Ownership check
  const [existing] = await db
    .select()
    .from(finTransactionsTable)
    .where(and(eq(finTransactionsTable.id, id), eq(finTransactionsTable.clerkUserId, userId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Verify property if changing it
  if (body.propertyId) {
    const prop = await db
      .select({ id: propertiesTable.id })
      .from(propertiesTable)
      .where(
        and(
          eq(propertiesTable.id, body.propertyId),
          eq(propertiesTable.clerkUserId, userId),
        ),
      )
      .limit(1);
    if (!prop.length) {
      res.status(403).json({ error: "Property not found or access denied" });
      return;
    }
  }

  const updateData: Partial<typeof finTransactionsTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.date !== undefined) updateData.date = body.date;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.amount !== undefined) updateData.amount = String(body.amount);
  if (body.type !== undefined) updateData.type = body.type;
  if (body.category !== undefined) updateData.category = body.category;
  if (body.vendorPayer !== undefined) updateData.vendorPayer = body.vendorPayer;
  if (body.paymentAccount !== undefined) updateData.paymentAccount = body.paymentAccount;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.rentalType !== undefined) updateData.rentalType = body.rentalType || null;
  if (body.taxYear !== undefined) updateData.taxYear = body.taxYear;
  if (body.isReviewed !== undefined) updateData.isReviewed = body.isReviewed;
  if (body.propertyId !== undefined) updateData.propertyId = body.propertyId;

  const [row] = await db
    .update(finTransactionsTable)
    .set(updateData)
    .where(eq(finTransactionsTable.id, id))
    .returning();

  res.json(toApiTx(row));
});

// ── DELETE /api/finances/transactions/:id ─────────────────────────────────
router.delete("/finances/transactions/:id", async (req, res) => {
  const userId = uid(req);
  const id = parseInt(req.params.id);

  const [existing] = await db
    .select({ id: finTransactionsTable.id })
    .from(finTransactionsTable)
    .where(and(eq(finTransactionsTable.id, id), eq(finTransactionsTable.clerkUserId, userId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.delete(finTransactionsTable).where(eq(finTransactionsTable.id, id));
  res.status(204).send();
});

// ── GET /api/finances/summary ─────────────────────────────────────────────
router.get("/finances/summary", async (req, res) => {
  const userId = uid(req);
  const { dateFrom, dateTo, propertyId, taxYear } = req.query as Record<string, string | undefined>;

  const conditions = [eq(finTransactionsTable.clerkUserId, userId)];
  if (dateFrom) conditions.push(gte(finTransactionsTable.date, dateFrom));
  if (dateTo) conditions.push(lte(finTransactionsTable.date, dateTo));
  if (propertyId) conditions.push(eq(finTransactionsTable.propertyId, parseInt(propertyId)));
  if (taxYear) conditions.push(eq(finTransactionsTable.taxYear, parseInt(taxYear)));

  const rows = await db
    .select()
    .from(finTransactionsTable)
    .where(and(...conditions));

  // User's properties for joining names
  const props = await db
    .select({ id: propertiesTable.id, name: propertiesTable.name, rentalType: propertiesTable.rentalType })
    .from(propertiesTable)
    .where(eq(propertiesTable.clerkUserId, userId));

  const propMap = new Map(props.map((p) => [p.id, p]));

  let grossIncome = 0;
  let operatingExpenses = 0;
  let mortgageInterestPaid = 0;
  let mortgagePrincipalPaid = 0;
  let capitalImprovements = 0;
  let ownerContributions = 0;
  let ownerDraws = 0;
  let unreviewed = 0;

  // Per-property aggregates
  const propAgg = new Map<
    number | null,
    {
      propId: number | null;
      propName: string;
      grossIncome: number;
      operatingExpenses: number;
      mortgagePayments: number;
      capitalImprovements: number;
    }
  >();

  const getOrInitProp = (id: number | null) => {
    if (!propAgg.has(id)) {
      const name = id ? (propMap.get(id)?.name ?? `Property #${id}`) : "Unassigned";
      propAgg.set(id, {
        propId: id,
        propName: name,
        grossIncome: 0,
        operatingExpenses: 0,
        mortgagePayments: 0,
        capitalImprovements: 0,
      });
    }
    return propAgg.get(id)!;
  };

  for (const row of rows) {
    const amt = parseFloat(String(row.amount));
    const agg = getOrInitProp(row.propertyId);
    if (!row.isReviewed) unreviewed++;

    switch (row.type) {
      case "income":
        grossIncome += amt;
        agg.grossIncome += amt;
        break;
      case "expense":
        if (row.category === "Mortgage Interest") {
          mortgageInterestPaid += amt;
        } else {
          operatingExpenses += amt;
        }
        agg.operatingExpenses += amt;
        break;
      case "loan_payment":
        if (row.category === "Principal") {
          mortgagePrincipalPaid += amt;
          agg.mortgagePayments += amt;
        } else if (row.category === "Interest") {
          mortgageInterestPaid += amt;
          agg.mortgagePayments += amt;
        } else {
          agg.mortgagePayments += amt;
        }
        break;
      case "capital_improvement":
        capitalImprovements += amt;
        agg.capitalImprovements += amt;
        break;
      case "owner_contribution":
        ownerContributions += amt;
        break;
      case "owner_draw":
        ownerDraws += amt;
        break;
    }
  }

  const noi = grossIncome - operatingExpenses;

  res.json({
    grossIncome,
    operatingExpenses,
    noi,
    mortgageInterestPaid,
    mortgagePrincipalPaid,
    capitalImprovements,
    ownerContributions,
    ownerDraws,
    unreviewed,
    totalTransactions: rows.length,
    byProperty: Array.from(propAgg.values()),
  });
});

// ── GET /api/finances/report.csv ──────────────────────────────────────────
router.get("/finances/report.csv", async (req, res) => {
  const userId = uid(req);
  const { taxYear, propertyId } = req.query as Record<string, string | undefined>;

  const conditions = [eq(finTransactionsTable.clerkUserId, userId)];
  if (taxYear) conditions.push(eq(finTransactionsTable.taxYear, parseInt(taxYear)));
  if (propertyId) conditions.push(eq(finTransactionsTable.propertyId, parseInt(propertyId)));

  const rows = await db
    .select()
    .from(finTransactionsTable)
    .where(and(...conditions))
    .orderBy(asc(finTransactionsTable.date));

  const props = await db
    .select({ id: propertiesTable.id, name: propertiesTable.name })
    .from(propertiesTable)
    .where(eq(propertiesTable.clerkUserId, userId));
  const propMap = new Map(props.map((p) => [p.id, p.name]));

  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const headers = [
    "Date",
    "Property",
    "Type",
    "Category",
    "Description",
    "Amount",
    "Vendor / Payer",
    "Payment Account",
    "Rental Type",
    "Tax Year",
    "Reviewed",
    "Notes",
  ];

  const csvRows = [
    headers.map(escape).join(","),
    ...rows.map((r) =>
      [
        r.date,
        propMap.get(r.propertyId ?? -1) ?? "Unassigned",
        r.type,
        r.category,
        r.description,
        parseFloat(String(r.amount)).toFixed(2),
        r.vendorPayer ?? "",
        r.paymentAccount ?? "",
        r.rentalType ?? "",
        r.taxYear ?? "",
        r.isReviewed ? "Yes" : "No",
        r.notes ?? "",
      ]
        .map(escape)
        .join(",")
    ),
  ];

  const year = taxYear ?? "all";
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="finances-${year}.csv"`,
  );
  res.send(csvRows.join("\n"));
});

// ── POST /finances/ai-parse ──────────────────────────────────────────────
// Parse a free-text transaction description using AI.
router.post("/finances/ai-parse", async (req, res) => {
  const { text, properties = [] } = req.body as {
    text: string;
    properties: Array<{ id: number; name: string }>;
  };

  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const todayStr = new Date().toISOString().split("T")[0];

  const INCOME_CATEGORIES = [
    "Rental Income", "Short-Term Rental Income", "Late Fees",
    "Pet Fees", "Parking Fees", "Laundry Income", "Storage Fees",
    "Application Fees", "Cleaning Fees", "Other Income",
  ];
  const EXPENSE_CATEGORIES = [
    "Mortgage Interest", "Property Taxes", "Homeowner's Insurance",
    "HOA Fees", "Property Management Fees", "Repairs & Maintenance",
    "Cleaning & Turnover", "Landscaping & Snow Removal", "Pest Control",
    "Utilities", "Advertising & Marketing", "Legal & Professional Fees",
    "Accounting & Tax Prep", "Travel & Transportation", "Office Supplies",
    "Supplies & Materials", "Appliances & Furnishings",
    "Pool & Hot Tub Maintenance", "Security Systems", "Internet & Cable",
    "Trash Removal", "Licenses & Permits", "Depreciation", "Other Expense",
  ];
  const LOAN_CATEGORIES = [
    "Principal Payment", "Interest Payment", "Escrow Payment",
    "Mortgage Payment (Combined)", "HELOC Payment", "Other Loan Payment",
  ];
  const CAPITAL_CATEGORIES = [
    "Roof Replacement", "HVAC System", "Plumbing Upgrade", "Electrical Upgrade",
    "Foundation Work", "Addition / Expansion", "Kitchen Renovation",
    "Bathroom Renovation", "Flooring", "Windows & Doors",
    "Siding & Exterior", "Driveway & Parking", "Other Capital Improvement",
  ];
  const OWNER_CATEGORIES = [
    "Owner Contribution", "Owner Draw", "Owner Loan Repayment",
    "Return of Capital", "Other Owner Transaction",
  ];

  const propList = (properties as Array<{ id: number; name: string }>)
    .map((p) => `  - id ${p.id}: "${p.name}"`)
    .join("\n");

  const systemPrompt = `You are a real estate bookkeeping assistant. Parse the user's transaction description and return a JSON object.

Today's date: ${todayStr}

User's properties:
${propList || "  (none provided)"}

Transaction types and their categories:
- "income": ${INCOME_CATEGORIES.join(", ")}
- "expense": ${EXPENSE_CATEGORIES.join(", ")}
- "loan_payment": ${LOAN_CATEGORIES.join(", ")}
- "capital_improvement": ${CAPITAL_CATEGORIES.join(", ")}
- "owner_contribution": ${OWNER_CATEGORIES.join(", ")}
- "owner_draw": ${OWNER_CATEGORIES.join(", ")}

Rules:
1. Match the property name (case-insensitive, partial match) to one of the user's properties. Return its numeric id in propertyId, or null if no match.
2. If the user mentions a property by name that isn't in the list, return propertyId: null and propertyName with what they said.
3. Infer date from context ("July rent" → ${todayStr.slice(0, 4)}-07-01, "last month" → first of last month). Default to today if unspecified.
4. Extract amount as a positive number, never negative.
5. For loan_payment: if user says "mortgage payment $2100 — $1800 principal, $300 interest", use "Mortgage Payment (Combined)" as category.
6. Set confidence: "high" if amount + type + category all clear; "medium" if one field is inferred; "low" if two or more are unclear.
7. Set clarification to a short note if something was ambiguous or assumed (e.g. "Assumed current year for July rent"). null if everything is clear.
8. rentalType: "long_term" for LTR/month-to-month, "short_term" for STR/Airbnb/VRBO. null if unclear.
9. isRecurring: true if the user explicitly says "every month", "monthly", "recurring", "repeat", "each month", "quarterly", "annually", "every year", "each quarter", "bi-annual", or any other clear recurring language. false otherwise.
10. recurringFrequency: if isRecurring is true, set to "monthly" | "quarterly" | "semi_annual" | "annual" based on what the user said. null if isRecurring is false.

Return ONLY valid JSON with these exact keys:
{
  "date": "YYYY-MM-DD",
  "description": "string",
  "amount": number or null,
  "type": "income" | "expense" | "loan_payment" | "capital_improvement" | "owner_contribution" | "owner_draw",
  "category": "string (must match one from the list above)",
  "propertyId": number or null,
  "propertyName": "string or null",
  "vendorPayer": "string or null",
  "rentalType": "long_term" | "short_term" | null,
  "notes": "string or null",
  "confidence": "high" | "medium" | "low",
  "clarification": "string or null",
  "isRecurring": boolean,
  "recurringFrequency": "monthly" | "quarterly" | "semi_annual" | "annual" | null
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      max_completion_tokens: 512,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text.trim() },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    res.json(parsed);
  } catch (err) {
    console.error("AI parse error:", err);
    res.status(500).json({ error: "AI parsing failed" });
  }
});

export default router;
