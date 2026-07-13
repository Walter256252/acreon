import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { propertiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { buildAmortizationSchedule } from "./payments";

const router: IRouter = Router();

router.get("/dashboard", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const properties = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.clerkUserId, userId))
    .orderBy(propertiesTable.createdAt);

  const summaries = properties.map((prop) => {
    // Compute how many payments have elapsed since loan start
    const start = new Date(prop.loanStartDate);
    const now = new Date();
    const monthsElapsed =
      (now.getFullYear() - start.getFullYear()) * 12 +
      (now.getMonth() - start.getMonth());

    const savedExtras =
      (prop.savedExtraPayments as Array<{ paymentNumber: number; amount: number }> | null) ?? [];

    const hasKnownBalance = prop.currentLoanBalance != null;

    const schedule = buildAmortizationSchedule({
      loanAmount: Number(prop.loanAmount),
      interestRate: Number(prop.interestRate),
      loanTermYears: prop.loanTermYears,
      loanStartDate: prop.loanStartDate,
      monthlyPayment: Number(prop.monthlyPayment),
      extraPaymentMonthly: prop.savedExtraMonthly != null ? Number(prop.savedExtraMonthly) : 0,
      extraPayments: savedExtras,
      startingBalance: hasKnownBalance ? Number(prop.currentLoanBalance) : undefined,
    });

    // When the user supplied a known balance, use it directly — the schedule in that case
    // starts from that balance going forward, so we don't look up a past payment row.
    // Otherwise compute the balance from the amortization schedule at today's payment index.
    const currentPaymentIdx = Math.max(0, Math.min(monthsElapsed - 1, schedule.length - 1));
    const estimatedBalance = hasKnownBalance
      ? Number(prop.currentLoanBalance)
      : monthsElapsed <= 0
        ? Number(prop.loanAmount)
        : (schedule[currentPaymentIdx]?.remainingBalance ?? 0);

    const currentValue = Number(prop.currentValue);
    const equity = currentValue - estimatedBalance;
    const equityPercent = currentValue > 0 ? (equity / currentValue) * 100 : 0;

    // Find payoff date: last entry in schedule where remainingBalance > 0
    const lastPayment = schedule.findLast((e) => e.remainingBalance > 0.01);
    const payoffDate = lastPayment ? lastPayment.paymentDate : null;

    const purchasePrice = Number(prop.purchasePrice);
    const appreciation = currentValue - purchasePrice;
    const appreciationPercent = purchasePrice > 0 ? (appreciation / purchasePrice) * 100 : 0;
    const ltv = currentValue > 0 ? (estimatedBalance / currentValue) * 100 : 0;

    return {
      id: prop.id,
      name: prop.name,
      address: prop.address,
      currentValue,
      purchasePrice,
      estimatedBalance: round(estimatedBalance),
      equity: round(equity),
      equityPercent: round(equityPercent),
      appreciation: round(appreciation),
      appreciationPercent: round(appreciationPercent),
      ltv: round(ltv),
      payoffDate,
      valueLastUpdatedAt: prop.valueLastUpdatedAt ? prop.valueLastUpdatedAt.toISOString() : null,
      zillowUrl: prop.zillowUrl ?? null,
      // Property Info fields
      titleHolder: prop.titleHolder ?? null,
      loanHolder: prop.loanHolder ?? null,
      lender: prop.lender ?? null,
      loanType: prop.loanType ?? null,
      hasHoa: prop.hasHoa ?? false,
      hoaAmount: prop.hoaAmount != null ? Number(prop.hoaAmount) : null,
      hoaName: prop.hoaName ?? null,
      insuranceCompany: prop.insuranceCompany ?? null,
      otherInsurances: prop.otherInsurances ?? null,
      propertyManagementCompany: prop.propertyManagementCompany ?? null,
      inTrustOrLlc: prop.inTrustOrLlc ?? false,
      trustOrLlcName: prop.trustOrLlcName ?? null,
    };
  });

  const totalPortfolioValue = summaries.reduce((sum, s) => sum + s.currentValue, 0);
  const totalLoanBalance = summaries.reduce((sum, s) => sum + s.estimatedBalance, 0);
  const totalEquity = totalPortfolioValue - totalLoanBalance;
  const monthlyPaymentTotal = properties.reduce((sum, p) => sum + Number(p.monthlyPayment), 0);

  // Property spotlights
  const sorted = [...summaries];
  const mostEquity = sorted.sort((a, b) => b.equity - a.equity)[0] ?? null;
  const leastEquity = sorted.sort((a, b) => a.equity - b.equity)[0] ?? null;
  const nextPayoff = summaries
    .filter((s) => s.payoffDate)
    .sort((a, b) => new Date(a.payoffDate!).getTime() - new Date(b.payoffDate!).getTime())[0] ?? null;
  const bestAppreciation = summaries
    .filter((s) => s.purchasePrice > 0)
    .sort((a, b) => b.appreciationPercent - a.appreciationPercent)[0] ?? null;
  const highestLTV = summaries
    .filter((s) => s.ltv > 0)
    .sort((a, b) => b.ltv - a.ltv)[0] ?? null;
  const avgEquityPercent = summaries.length > 0
    ? summaries.reduce((sum, s) => sum + s.equityPercent, 0) / summaries.length
    : 0;

  // Property Info aggregates
  const hoaProperties = summaries.filter(s => s.hasHoa);
  const totalHoaMonthly = hoaProperties.reduce((sum, s) => sum + (s.hoaAmount ?? 0), 0);
  const entityProperties = summaries.filter(s => s.inTrustOrLlc);
  const managedProperties = summaries.filter(s => s.propertyManagementCompany);
  const uninsuredProperties = summaries.filter(s => !s.insuranceCompany);

  // Properties missing key info (no lender, no title holder)
  const missingInfoCount = summaries.filter(
    s => !s.lender || !s.titleHolder || !s.insuranceCompany,
  ).length;

  res.json({
    totalProperties: properties.length,
    totalPortfolioValue: round(totalPortfolioValue),
    totalLoanBalance: round(totalLoanBalance),
    totalEquity: round(totalEquity),
    monthlyPaymentTotal: round(monthlyPaymentTotal),
    avgEquityPercent: round(avgEquityPercent),
    mostEquity: mostEquity ? { id: mostEquity.id, name: mostEquity.name, equity: mostEquity.equity, equityPercent: mostEquity.equityPercent } : null,
    leastEquity: leastEquity ? { id: leastEquity.id, name: leastEquity.name, equity: leastEquity.equity, equityPercent: leastEquity.equityPercent } : null,
    nextPayoff: nextPayoff ? { id: nextPayoff.id, name: nextPayoff.name, payoffDate: nextPayoff.payoffDate, estimatedBalance: nextPayoff.estimatedBalance } : null,
    bestAppreciation: bestAppreciation ? { id: bestAppreciation.id, name: bestAppreciation.name, appreciation: bestAppreciation.appreciation, appreciationPercent: bestAppreciation.appreciationPercent } : null,
    highestLTV: highestLTV ? { id: highestLTV.id, name: highestLTV.name, ltv: highestLTV.ltv, estimatedBalance: highestLTV.estimatedBalance } : null,
    // Property Info spotlights
    hoaCount: hoaProperties.length,
    totalHoaMonthly: round(totalHoaMonthly),
    entityCount: entityProperties.length,
    managedCount: managedProperties.length,
    uninsuredCount: uninsuredProperties.length,
    missingInfoCount,
    properties: summaries,
  });
});

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export default router;
