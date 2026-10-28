import { monthIndex, LoanInputError } from "../lib/loan";
import { getPropertyLoan } from "../lib/propertyLoan";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { paymentsTable, propertiesTable } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  ListPaymentsParams,
  LogPaymentParams,
  LogPaymentBody,
  GetAmortizationScheduleParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function uid(req: Parameters<typeof getAuth>[0]) {
  return getAuth(req).userId!;
}

// List logged payments for a property (ownership enforced)
router.get("/properties/:id/payments", async (req, res) => {
  const userId = uid(req);
  const { id } = ListPaymentsParams.parse({ id: Number(req.params.id) });
  // Verify property belongs to user
  const [prop] = await db.select({ id: propertiesTable.id }).from(propertiesTable)
    .where(and(eq(propertiesTable.id, id), eq(propertiesTable.clerkUserId, userId)));
  if (!prop) { res.status(404).json({ error: "Property not found" }); return; }
  const rows = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.propertyId, id))
    .orderBy(asc(paymentsTable.paymentNumber), asc(paymentsTable.paymentDate));
  res.json(rows.map(toApiPayment));
});

// Log a payment for a property (ownership enforced)
router.post("/properties/:id/payments", async (req, res) => {
  const userId = uid(req);
  const { id } = LogPaymentParams.parse({ id: Number(req.params.id) });
  const body = LogPaymentBody.parse(req.body);
  monthIndex(body.paymentDate);
  for (const amount of [body.paymentAmount, body.interestAmount, body.extraPayment ?? 0, body.remainingBalance]) {
    if (!Number.isFinite(amount) || amount < 0) throw new LoanInputError("Payment amounts and balances must be nonnegative");
  }
  if (!Number.isFinite(body.principalAmount)) throw new LoanInputError("Invalid principal amount");
  if (body.paymentNumber != null && (!Number.isInteger(body.paymentNumber) || body.paymentNumber < 1)) {
    throw new LoanInputError("Payment number must be a positive integer");
  }

  // Verify property belongs to user
  const [prop] = await db.select().from(propertiesTable)
    .where(and(eq(propertiesTable.id, id), eq(propertiesTable.clerkUserId, userId)));
  if (!prop) { res.status(404).json({ error: "Property not found" }); return; }

  const [row] = await db.insert(paymentsTable).values({
    propertyId: id,
    paymentDate: body.paymentDate,
    paymentAmount: String(body.paymentAmount),
    principalAmount: String(body.principalAmount),
    interestAmount: String(body.interestAmount),
    extraPayment: String(body.extraPayment ?? 0),
    remainingBalance: String(body.remainingBalance),
    paymentNumber: body.paymentNumber ?? null,
  }).returning();

  res.status(201).json(toApiPayment(row));
});

// Get full amortization schedule for a property (ownership enforced)
router.get("/properties/:id/amortization", async (req, res) => {
  const userId = uid(req);
  const { id } = GetAmortizationScheduleParams.parse({ id: Number(req.params.id) });

  const [prop] = await db.select().from(propertiesTable)
    .where(and(eq(propertiesTable.id, id), eq(propertiesTable.clerkUserId, userId)));
  if (!prop) { res.status(404).json({ error: "Property not found" }); return; }

  // Fetch all logged payments to mark which months are logged
  const loggedPayments = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.propertyId, id));

  const loan = await getPropertyLoan(prop);
  const loggedDates = new Set(loggedPayments.map(p => p.paymentDate.slice(0, 7)));
  const schedule = loan.schedule.map(row => ({ ...row, isLogged: loggedDates.has(row.paymentDate.slice(0, 7)) }));

  res.json(schedule);
});

function toApiPayment(row: typeof paymentsTable.$inferSelect) {
  return {
    id: row.id,
    propertyId: row.propertyId,
    paymentDate: row.paymentDate,
    paymentAmount: Number(row.paymentAmount),
    principalAmount: Number(row.principalAmount),
    interestAmount: Number(row.interestAmount),
    extraPayment: Number(row.extraPayment ?? 0),
    remainingBalance: Number(row.remainingBalance),
    paymentNumber: row.paymentNumber ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export default router;
