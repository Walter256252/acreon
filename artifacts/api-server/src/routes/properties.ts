import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { propertiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

// List all properties
router.get("/properties", async (req, res) => {
  const rows = await db.select().from(propertiesTable).orderBy(propertiesTable.createdAt);
  res.json(rows.map(toApiProperty));
});

// Create property
router.post("/properties", async (req, res) => {
  const body = CreatePropertyBody.parse(req.body);
  const [row] = await db.insert(propertiesTable).values({
    name: body.name,
    address: body.address,
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
    currentLoanBalance: body.currentLoanBalance != null ? String(body.currentLoanBalance) : null,
  }).returning();
  res.status(201).json(toApiProperty(row));
});

// Get single property
router.get("/properties/:id", async (req, res) => {
  const { id } = GetPropertyParams.parse({ id: Number(req.params.id) });
  const [row] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, id));
  if (!row) { res.status(404).json({ error: "Property not found" }); return; }
  res.json(toApiProperty(row));
});

// Update property
router.put("/properties/:id", async (req, res) => {
  const { id } = UpdatePropertyParams.parse({ id: Number(req.params.id) });
  const body = UpdatePropertyBody.parse(req.body);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.address !== undefined) updates.address = body.address;
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
  if ("savedExtraMonthly" in body) updates.savedExtraMonthly = body.savedExtraMonthly != null ? String(body.savedExtraMonthly) : null;
  if ("savedExtraPayments" in body) updates.savedExtraPayments = body.savedExtraPayments ?? null;
  if (body.currentValue !== undefined) updates.valueLastUpdatedAt = new Date();
  if ("zillowUrl" in body) updates.zillowUrl = body.zillowUrl ?? null;
  if ("monthlyTaxes" in body) updates.monthlyTaxes = body.monthlyTaxes != null ? String(body.monthlyTaxes) : null;
  if ("monthlyInsurance" in body) updates.monthlyInsurance = body.monthlyInsurance != null ? String(body.monthlyInsurance) : null;
  if ("monthlyRent" in body) updates.monthlyRent = body.monthlyRent != null ? String(body.monthlyRent) : null;
  if ("currentLoanBalance" in body) updates.currentLoanBalance = body.currentLoanBalance != null ? String(body.currentLoanBalance) : null;

  const [row] = await db.update(propertiesTable).set(updates).where(eq(propertiesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Property not found" }); return; }
  res.json(toApiProperty(row));
});

// Bulk import properties
router.post("/properties/bulk-import", async (req, res) => {
  const { properties } = BulkImportPropertiesBody.parse(req.body);

  let imported = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < properties.length; i++) {
    const p = properties[i];
    try {
      await db.insert(propertiesTable).values({
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
    } catch (err) {
      errors.push({ row: i + 1, message: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  res.json({ imported, failed: errors.length, errors });
});

// Delete property
router.delete("/properties/:id", async (req, res) => {
  const { id } = DeletePropertyParams.parse({ id: Number(req.params.id) });
  const [row] = await db.delete(propertiesTable).where(eq(propertiesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Property not found" }); return; }
  res.status(204).send();
});

// ── POST /api/properties/estimate-taxes ───────────────────────────────────
router.post("/properties/estimate-taxes", async (req, res) => {
  const { zipCode, propertyValue } = req.body as { zipCode?: string; propertyValue?: number };
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
          "You are a US property tax expert. When given a ZIP code and estimated property value, return the estimated annual and monthly property tax as JSON. Use actual county/city effective tax rates for the ZIP code. Be specific and accurate — do not guess. Return ONLY valid JSON with this exact shape: { \"monthly\": number, \"annual\": number, \"effectiveRate\": string, \"notes\": string }. The \"effectiveRate\" should be a percentage string like \"1.23%\". The \"notes\" field should name the county and briefly explain the rate used (1 sentence).",
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
      annual: Math.round(parsed.annual ?? parsed.monthly * 12 ?? 0),
      effectiveRate: parsed.effectiveRate ?? "—",
      notes: parsed.notes ?? "",
    });
  } catch {
    res.status(500).json({ error: "Invalid response from AI" });
  }
});

function toApiProperty(row: typeof propertiesTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
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
    savedExtraMonthly: row.savedExtraMonthly != null ? Number(row.savedExtraMonthly) : null,
    savedExtraPayments: (row.savedExtraPayments as Array<{ paymentNumber: number; amount: number }> | null) ?? null,
    valueLastUpdatedAt: row.valueLastUpdatedAt ? row.valueLastUpdatedAt.toISOString() : null,
    zillowUrl: row.zillowUrl ?? null,
    monthlyTaxes: row.monthlyTaxes != null ? Number(row.monthlyTaxes) : null,
    monthlyInsurance: row.monthlyInsurance != null ? Number(row.monthlyInsurance) : null,
    monthlyRent: row.monthlyRent != null ? Number(row.monthlyRent) : null,
    currentLoanBalance: row.currentLoanBalance != null ? Number(row.currentLoanBalance) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export default router;
