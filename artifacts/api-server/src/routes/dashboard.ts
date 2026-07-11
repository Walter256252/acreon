import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { propertiesTable } from "@workspace/db";
import { buildAmortizationSchedule } from "./payments";

const router: IRouter = Router();

router.get("/dashboard", async (_req, res) => {
  const properties = await db.select().from(propertiesTable).orderBy(propertiesTable.createdAt);

  const summaries = properties.map((prop) => {
    // Compute how many payments have elapsed since loan start
    const start = new Date(prop.loanStartDate);
    const now = new Date();
    const monthsElapsed =
      (now.getFullYear() - start.getFullYear()) * 12 +
      (now.getMonth() - start.getMonth());

    const savedExtras =
      (prop.savedExtraPayments as Array<{ paymentNumber: number; amount: number }> | null) ?? [];

    const schedule = buildAmortizationSchedule({
      loanAmount: Number(prop.loanAmount),
      interestRate: Number(prop.interestRate),
      loanTermYears: prop.loanTermYears,
      loanStartDate: prop.loanStartDate,
      monthlyPayment: Number(prop.monthlyPayment),
      extraPaymentMonthly: prop.savedExtraMonthly != null ? Number(prop.savedExtraMonthly) : 0,
      extraPayments: savedExtras,
    });

    // Current balance = balance at today's payment number (clamped to schedule length)
    const currentPaymentIdx = Math.max(0, Math.min(monthsElapsed - 1, schedule.length - 1));
    const estimatedBalance =
      monthsElapsed <= 0
        ? Number(prop.loanAmount)
        : (schedule[currentPaymentIdx]?.remainingBalance ?? 0);

    const currentValue = Number(prop.currentValue);
    const equity = currentValue - estimatedBalance;
    const equityPercent = currentValue > 0 ? (equity / currentValue) * 100 : 0;

    return {
      id: prop.id,
      name: prop.name,
      address: prop.address,
      currentValue,
      estimatedBalance: round(estimatedBalance),
      equity: round(equity),
      equityPercent: round(equityPercent),
      valueLastUpdatedAt: prop.valueLastUpdatedAt ? prop.valueLastUpdatedAt.toISOString() : null,
      zillowUrl: prop.zillowUrl ?? null,
    };
  });

  const totalPortfolioValue = summaries.reduce((sum, s) => sum + s.currentValue, 0);
  const totalLoanBalance = summaries.reduce((sum, s) => sum + s.estimatedBalance, 0);
  const totalEquity = totalPortfolioValue - totalLoanBalance;
  const monthlyPaymentTotal = properties.reduce((sum, p) => sum + Number(p.monthlyPayment), 0);

  res.json({
    totalProperties: properties.length,
    totalPortfolioValue: round(totalPortfolioValue),
    totalLoanBalance: round(totalLoanBalance),
    totalEquity: round(totalEquity),
    monthlyPaymentTotal: round(monthlyPaymentTotal),
    properties: summaries,
  });
});

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export default router;
