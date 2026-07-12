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

  const loggedByNumber = new Set(loggedPayments.map(p => p.paymentNumber).filter(Boolean));

  const savedExtras = (prop.savedExtraPayments as Array<{ paymentNumber: number; amount: number }> | null) ?? [];

  const schedule = buildAmortizationSchedule({
    loanAmount: Number(prop.loanAmount),
    interestRate: Number(prop.interestRate),
    loanTermYears: prop.loanTermYears,
    loanStartDate: prop.loanStartDate,
    monthlyPayment: Number(prop.monthlyPayment),
    extraPaymentMonthly: prop.savedExtraMonthly != null ? Number(prop.savedExtraMonthly) : 0,
    extraPayments: savedExtras,
    loggedByNumber,
    startingBalance: prop.currentLoanBalance != null ? Number(prop.currentLoanBalance) : undefined,
  });

  res.json(schedule);
});

export function buildAmortizationSchedule(opts: {
  loanAmount: number;
  interestRate: number;
  loanTermYears: number;
  loanStartDate: string;
  monthlyPayment: number;
  extraPaymentMonthly?: number;
  extraPayments?: Array<{ paymentNumber: number; amount: number }>;
  loggedByNumber?: Set<number | null>;
  startingBalance?: number;
}) {
  const {
    loanAmount,
    interestRate,
    loanTermYears,
    loanStartDate,
    monthlyPayment,
    extraPaymentMonthly = 0,
    extraPayments = [],
    loggedByNumber = new Set(),
    startingBalance,
  } = opts;

  const monthlyRate = interestRate / 100 / 12;
  const totalPayments = loanTermYears * 12;
  const extraByNumber = new Map(extraPayments.map(e => [e.paymentNumber, e.amount]));

  // Use the override balance if provided (mid-loan entry), otherwise start fresh
  let balance = startingBalance ?? loanAmount;
  let cumulativeInterest = 0;
  let cumulativePrincipal = 0;

  const [startYear, startMonth] = loanStartDate.split("-").map(Number);
  const schedule = [];

  for (let i = 1; i <= totalPayments; i++) {
    if (balance <= 0) break;

    const interestCharge = balance * monthlyRate;
    const extraOneTime = extraByNumber.get(i) ?? 0;
    const extraTotal = extraPaymentMonthly + extraOneTime;

    let principalPaid = monthlyPayment - interestCharge;
    if (principalPaid < 0) principalPaid = 0;

    // Apply extra
    let totalPrincipal = principalPaid + extraTotal;
    if (totalPrincipal > balance) totalPrincipal = balance;

    const totalPaymentAmount = interestCharge + totalPrincipal;
    balance -= totalPrincipal;
    if (balance < 0) balance = 0;

    cumulativeInterest += interestCharge;
    cumulativePrincipal += totalPrincipal;

    // Calculate payment date
    const monthIndex = (startMonth - 1 + i - 1) % 12;
    const yearOffset = Math.floor((startMonth - 1 + i - 1) / 12);
    const payYear = startYear + yearOffset;
    const payMonth = String(monthIndex + 1).padStart(2, "0");
    const paymentDate = `${payYear}-${payMonth}-01`;

    schedule.push({
      paymentNumber: i,
      paymentDate,
      paymentAmount: round(totalPaymentAmount),
      principalAmount: round(totalPrincipal),
      interestAmount: round(interestCharge),
      remainingBalance: round(balance),
      cumulativeInterest: round(cumulativeInterest),
      cumulativePrincipal: round(cumulativePrincipal),
      isLogged: loggedByNumber.has(i),
    });

    if (balance === 0) break;
  }

  return schedule;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

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
