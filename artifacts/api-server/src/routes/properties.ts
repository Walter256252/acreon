import { buildAmortizationSchedule, propertyLoanSnapshot, rebaseLoanPlan, futureExtraPayments, futureExtraOffset, LoanInputError } from "../lib/loan";
import { getPropertyLoan } from "../lib/propertyLoan";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { propertiesTable, propertyGeocodesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  CreatePropertyBody,
  UpdatePropertyBody,
  GetPropertyParams,
  UpdatePropertyParams,
  DeletePropertyParams,
  BulkImportPropertiesBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function uid(req: Parameters<typeof getAuth>[0]) {
  return getAuth(req).userId!; // guaranteed non-null by global requireAuth middleware
}

// ── GET /api/properties ───────────────────────────────────────────────────
router.get("/properties", async (req, res) => {
  const userId = uid(req);
  const rows = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.clerkUserId, userId))
    .orderBy(propertiesTable.createdAt);
  res.json(await Promise.all(rows.map(toApiProperty)));
});

// ── POST /api/properties ──────────────────────────────────────────────────
router.post("/properties", async (req, res) => {
  const userId = uid(req);
  const body = CreatePropertyBody.parse(req.body);
  if (body.loanTermYears <= 0) throw new LoanInputError("Loan term must be positive");
  buildAmortizationSchedule({ ...body, startingBalance: body.currentLoanBalance ?? undefined });
  const [row] = await db
    .insert(propertiesTable)
    .values({
      clerkUserId: userId,
      name: body.name,
      address: body.address,
      city: body.city ?? null,
      state: body.state ?? null,
      zip: body.zip ?? null,
      yearBought: body.yearBought,
      purchasePrice: String(body.purchasePrice),
      currentValue: String(body.currentValue),
      loanAmount: String(body.loanAmount),
      interestRate: String(body.interestRate),
      loanTermYears: body.loanTermYears,
      loanStartDate: body.loanStartDate,
      monthlyPayment: String(body.monthlyPayment),
      notes: body.notes ?? null,
      zillowUrl: body.zillowUrl ?? null,
      currentLoanBalanceAsOf: body.currentLoanBalance != null ? new Date() : null,
      currentLoanBalance:
        body.currentLoanBalance != null ? String(body.currentLoanBalance) : null,
    })
    .returning();
  res.status(201).json(await toApiProperty(row));
});

// ── GET /api/properties/:id ───────────────────────────────────────────────
router.get("/properties/:id", async (req, res) => {
  const userId = uid(req);
  const { id } = GetPropertyParams.parse({ id: Number(req.params.id) });
  const [row] = await db
    .select()
    .from(propertiesTable)
    .where(and(eq(propertiesTable.id, id), eq(propertiesTable.clerkUserId, userId)));
  if (!row) { res.status(404).json({ error: "Property not found" }); return; }
  res.json(await toApiProperty(row));
});

// ── PUT /api/properties/:id ───────────────────────────────────────────────
router.put("/properties/:id", async (req, res) => {
  const userId = uid(req);
  const { id } = UpdatePropertyParams.parse({ id: Number(req.params.id) });
  const body = UpdatePropertyBody.parse(req.body);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.address !== undefined) updates.address = body.address;
  if ("city" in body) updates.city = body.city ?? null;
  if ("state" in body) updates.state = body.state ?? null;
  if ("zip" in body) updates.zip = body.zip ?? null;
  if (body.yearBought !== undefined) updates.yearBought = body.yearBought;
  if (body.purchasePrice !== undefined) updates.purchasePrice = String(body.purchasePrice);
  if (body.currentValue !== undefined) updates.currentValue = String(body.currentValue);
  if (body.loanAmount !== undefined) updates.loanAmount = String(body.loanAmount);
  if (body.interestRate !== undefined) updates.interestRate = String(body.interestRate);
  if (body.loanTermYears !== undefined) updates.loanTermYears = body.loanTermYears;
  if (body.loanStartDate !== undefined) updates.loanStartDate = body.loanStartDate;
  if (body.monthlyPayment !== undefined) updates.monthlyPayment = String(body.monthlyPayment);
  if ("notes" in body) updates.notes = body.notes ?? null;
  if (body.autoPayEnabled !== undefined) updates.autoPayEnabled = body.autoPayEnabled;
  if ("savedExtraMonthly" in body)
    updates.savedExtraMonthly =
      body.savedExtraMonthly != null ? String(body.savedExtraMonthly) : null;
  if ("savedExtraPayments" in body) updates.savedExtraPayments = body.savedExtraPayments ?? null;
  if (body.currentValue !== undefined) updates.valueLastUpdatedAt = new Date();
  if ("zillowUrl" in body) updates.zillowUrl = body.zillowUrl ?? null;
  if ("monthlyTaxes" in body)
    updates.monthlyTaxes = body.monthlyTaxes != null ? String(body.monthlyTaxes) : null;
  if ("monthlyInsurance" in body)
    updates.monthlyInsurance =
      body.monthlyInsurance != null ? String(body.monthlyInsurance) : null;
  if ("monthlyRent" in body)
    updates.monthlyRent = body.monthlyRent != null ? String(body.monthlyRent) : null;
  if ("currentLoanBalance" in body) {
    updates.currentLoanBalance = body.currentLoanBalance != null ? String(body.currentLoanBalance) : null;
    updates.currentLoanBalanceAsOf = body.currentLoanBalance != null ? new Date() : null;
  }

  const [existing] = await db.select().from(propertiesTable)
    .where(and(eq(propertiesTable.id, id), eq(propertiesTable.clerkUserId, userId)));
  if (!existing) { res.status(404).json({ error: "Property not found" }); return; }
  const previousLoan = await getPropertyLoan(existing);
  Object.assign(updates, rebaseLoanPlan(existing, body, previousLoan));
  const candidate = { ...existing, ...updates } as typeof existing;
  propertyLoanSnapshot(candidate); // Validate before committing loan changes.
  // Store one-time extras by original loan month so snapshots never replay them.
  if (body.savedExtraPayments != null) {
    // Input numbers refer to the schedule the user saw before this update.
    const numberingLoan = body.currentLoanBalance != null ? await getPropertyLoan(candidate) : previousLoan;
    const offset = futureExtraOffset(numberingLoan, candidate.loanStartDate);
    updates.savedExtraPayments = body.savedExtraPayments.map(e => ({ ...e, paymentNumber: e.paymentNumber + offset }));
  }

  const locationChanged =
    body.address !== undefined ||
    "city" in body ||
    "state" in body ||
    "zip" in body;

  const [row] = await db
    .update(propertiesTable)
    .set(updates)
    .where(and(eq(propertiesTable.id, id), eq(propertiesTable.clerkUserId, userId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Property not found" }); return; }

  // If the address changed, bust the geocode cache so the map re-geocodes
  // the property on the next request with the new address.
  if (locationChanged) {
    await db
      .delete(propertyGeocodesTable)
      .where(eq(propertyGeocodesTable.propertyId, id));
  }

  res.json(await toApiProperty(row));
});

// ── POST /api/properties/bulk-import ─────────────────────────────────────
router.post("/properties/bulk-import", async (req, res) => {
  const userId = uid(req);
  const { properties } = BulkImportPropertiesBody.parse(req.body);

  let imported = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < properties.length; i++) {
    const p = properties[i];
    try {
      if (p.loanTermYears <= 0) throw new LoanInputError("Loan term must be positive");
      buildAmortizationSchedule(p);
      await db.insert(propertiesTable).values({
        clerkUserId: userId,
        name: p.name,
        address: p.address,
        yearBought: p.yearBought,
        purchasePrice: String(p.purchasePrice),
        currentValue: String(p.currentValue),
        loanAmount: String(p.loanAmount),
        interestRate: String(p.interestRate),
        loanTermYears: p.loanTermYears,
        loanStartDate: p.loanStartDate,
        monthlyPayment: String(p.monthlyPayment),
        notes: p.notes ?? null,
      });
      imported++;
    } catch {
      errors.push({
        row: i + 1,
        message: "Invalid or missing required fields on this row.",
      });
    }
  }

  res.json({ imported, failed: errors.length, errors });
});

// ── DELETE /api/properties/:id ────────────────────────────────────────────
router.delete("/properties/:id", async (req, res) => {
  const userId = uid(req);
  const { id } = DeletePropertyParams.parse({ id: Number(req.params.id) });
  const [row] = await db
    .delete(propertiesTable)
    .where(and(eq(propertiesTable.id, id), eq(propertiesTable.clerkUserId, userId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Property not found" }); return; }
  res.status(204).send();
});

// ── POST /api/properties/estimate-taxes ───────────────────────────────────
router.post("/properties/estimate-taxes", async (req, res) => {
  const { zipCode, propertyValue } = req.body as {
    zipCode?: string;
    propertyValue?: number;
  };
  if (!zipCode || String(zipCode).trim().length < 5) {
    res.status(400).json({ error: "A valid ZIP code is required" });
    return;
  }
  if (!propertyValue || propertyValue <= 0) {
    res.status(400).json({ error: "Property value is required" });
    return;
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    max_completion_tokens: 512,
    messages: [
      {
        role: "system",
        content:
          'You are a US property tax expert. When given a ZIP code and estimated property value, return the estimated annual and monthly property tax as JSON. Use actual county/city effective tax rates for the ZIP code. Be specific and accurate — do not guess. Return ONLY valid JSON with this exact shape: { "monthly": number, "annual": number, "effectiveRate": string, "notes": string }. The "effectiveRate" should be a percentage string like "1.23%". The "notes" field should name the county and briefly explain the rate used (1 sentence).',
      },
      {
        role: "user",
        content: `ZIP code: ${String(zipCode).trim()}\nEstimated property value: ${Math.round(propertyValue).toLocaleString()}\n\nReturn the estimated property tax as JSON.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    res.status(500).json({ error: "Could not parse estimate from AI response" });
    return;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    res.json({
      monthly: Math.round(parsed.monthly ?? 0),
      annual: Math.round(parsed.annual ?? (parsed.monthly ?? 0) * 12),
      effectiveRate: parsed.effectiveRate ?? "—",
      notes: parsed.notes ?? "",
    });
  } catch {
    res.status(500).json({ error: "Invalid response from AI" });
  }
});

// ── PATCH /api/properties/:id/receipt-folder ─────────────────────────────
router.patch("/properties/:id/receipt-folder", async (req, res) => {
  const userId = getAuth(req).userId!;
  const id = parseInt(req.params.id);
  const { url } = req.body as { url: string | null };

  const owned = await assertPropertyOwner(id, userId);
  if (!owned) { res.status(403).json({ error: "Not found" }); return; }

  const [row] = await db
    .update(propertiesTable)
    .set({ receiptFolderUrl: url || null, updatedAt: new Date() })
    .where(eq(propertiesTable.id, id))
    .returning();

  res.json(await toApiProperty(row));
});

// ── PATCH /api/properties/:id/property-info ───────────────────────────────
router.patch("/properties/:id/property-info", async (req, res) => {
  const userId = uid(req);
  const id = parseInt(req.params.id);

  const owned = await assertPropertyOwner(id, userId);
  if (!owned) { res.status(403).json({ error: "Not found" }); return; }

  const body = req.body as {
    titleHolder?: string | null;
    loanHolder?: string | null;
    lender?: string | null;
    loanType?: string | null;
    hasHoa?: boolean;
    hoaAmount?: number | null;
    hoaName?: string | null;
    insuranceCompany?: string | null;
    otherInsurances?: string | null;
    propertyManagementCompany?: string | null;
    inTrustOrLlc?: boolean;
    trustOrLlcName?: string | null;
  };

  const [row] = await db
    .update(propertiesTable)
    .set({
      titleHolder: body.titleHolder ?? null,
      loanHolder: body.loanHolder ?? null,
      lender: body.lender ?? null,
      loanType: body.loanType ?? null,
      hasHoa: body.hasHoa ?? false,
      hoaAmount: body.hoaAmount != null ? String(body.hoaAmount) : null,
      hoaName: body.hoaName ?? null,
      insuranceCompany: body.insuranceCompany ?? null,
      otherInsurances: body.otherInsurances ?? null,
      propertyManagementCompany: body.propertyManagementCompany ?? null,
      inTrustOrLlc: body.inTrustOrLlc ?? false,
      trustOrLlcName: body.trustOrLlcName ?? null,
      updatedAt: new Date(),
    })
    .where(eq(propertiesTable.id, id))
    .returning();

  res.json(await toApiProperty(row));
});

// ── PATCH /api/properties/:id/rental-type (occupancy sub-route lives here) ─
// Ownership enforced by matching clerkUserId
export async function assertPropertyOwner(
  propertyId: number,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: propertiesTable.id })
    .from(propertiesTable)
    .where(and(eq(propertiesTable.id, propertyId), eq(propertiesTable.clerkUserId, userId)));
  return !!row;
}

async function toApiProperty(row: typeof propertiesTable.$inferSelect) {
  const loan = await getPropertyLoan(row);
  const extras = futureExtraPayments(loan, row.loanStartDate);
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city ?? null,
    state: row.state ?? null,
    zip: row.zip ?? null,
    yearBought: row.yearBought,
    purchasePrice: Number(row.purchasePrice),
    currentValue: Number(row.currentValue),
    loanAmount: Number(row.loanAmount),
    interestRate: Number(row.interestRate),
    loanTermYears: row.loanTermYears,
    loanStartDate: row.loanStartDate,
    monthlyPayment: Number(row.monthlyPayment),
    notes: row.notes ?? null,
    autoPayEnabled: row.autoPayEnabled,
    savedExtraMonthly:
      row.savedExtraMonthly != null ? Number(row.savedExtraMonthly) : null,
    savedExtraPayments: extras.length ? extras : null,
    valueLastUpdatedAt: row.valueLastUpdatedAt
      ? row.valueLastUpdatedAt.toISOString()
      : null,
    zillowUrl: row.zillowUrl ?? null,
    receiptFolderUrl: row.receiptFolderUrl ?? null,
    // Property info fields
    titleHolder: row.titleHolder ?? null,
    loanHolder: row.loanHolder ?? null,
    lender: row.lender ?? null,
    loanType: row.loanType ?? null,
    hasHoa: row.hasHoa ?? false,
    hoaAmount: row.hoaAmount != null ? Number(row.hoaAmount) : null,
    hoaName: row.hoaName ?? null,
    insuranceCompany: row.insuranceCompany ?? null,
    otherInsurances: row.otherInsurances ?? null,
    propertyManagementCompany: row.propertyManagementCompany ?? null,
    inTrustOrLlc: row.inTrustOrLlc ?? false,
    trustOrLlcName: row.trustOrLlcName ?? null,
    monthlyTaxes: row.monthlyTaxes != null ? Number(row.monthlyTaxes) : null,
    monthlyInsurance:
      row.monthlyInsurance != null ? Number(row.monthlyInsurance) : null,
    monthlyRent: row.monthlyRent != null ? Number(row.monthlyRent) : null,
    currentLoanBalance:
      loan.hasSnapshot ? loan.currentBalance : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export default router;
