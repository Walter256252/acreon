import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { finTransactionsTable, propertiesTable } from "@workspace/db";
import { eq, and, gte, lte, desc, asc } from "drizzle-orm";
import { getAuth } from "@clerk/express";

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

export default router;
