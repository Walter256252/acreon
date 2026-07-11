import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { propertiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export default router;
