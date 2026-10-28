import { getPropertyLoan } from "../lib/propertyLoan";
import { monthIndex, monthDate, todayMonth, balanceBeforeMonth } from "../lib/loan";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { propertiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();

const MILESTONES = [5, 10, 15, 20, 30];

router.get("/projections", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const properties = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.clerkUserId, userId))
    .orderBy(propertiesTable.name);

  const today = new Date();

  const propertyProjections = await Promise.all(properties.map(async (prop) => {
    const loan = await getPropertyLoan(prop, today);
    const snapshots = MILESTONES.map((years) => {
      const target = monthDate(monthIndex(todayMonth(today)) + years * 12);
      const remainingBalance = balanceBeforeMonth(loan.schedule, loan.initial, target);
      const row = loan.schedule.filter(r => monthIndex(r.paymentDate) < monthIndex(target)).at(-1);
      const cumulativeInterestPaid = row?.cumulativeInterest ?? 0;
      const cumulativePrincipalPaid = row?.cumulativePrincipal ?? 0;
      const equity = Number(prop.currentValue) - remainingBalance;
      const isPaidOff = remainingBalance === 0;
      const payoffDate = loan.payoffDate ?? undefined;
      return {
        years,
        remainingBalance: round(remainingBalance),
        cumulativeInterestPaid: round(cumulativeInterestPaid),
        cumulativePrincipalPaid: round(cumulativePrincipalPaid),
        equity: round(equity),
        isPaidOff,
        payoffDate: isPaidOff ? payoffDate : undefined,
      };
    });

    const currentBalance = loan.currentBalance;

    return {
      id: prop.id,
      name: prop.name,
      address: prop.address,
      currentValue: Number(prop.currentValue),
      loanAmount: Number(prop.loanAmount),
      interestRate: Number(prop.interestRate),
      loanTermYears: prop.loanTermYears,
      monthlyPayment: Number(prop.monthlyPayment),
      currentBalance: round(currentBalance),
      snapshots,
    };
  }));

  // Portfolio totals per milestone
  const totals = MILESTONES.map((years) => {
    const snapshotsAtYear = propertyProjections.map(
      (p) => p.snapshots.find((s) => s.years === years)!
    );
    return {
      years,
      totalValue: round(propertyProjections.reduce((s, p) => s + p.currentValue, 0)),
      totalRemainingBalance: round(snapshotsAtYear.reduce((s, sn) => s + sn.remainingBalance, 0)),
      totalEquity: round(snapshotsAtYear.reduce((s, sn) => s + sn.equity, 0)),
      totalInterestPaid: round(snapshotsAtYear.reduce((s, sn) => s + sn.cumulativeInterestPaid, 0)),
      totalPrincipalPaid: round(snapshotsAtYear.reduce((s, sn) => s + sn.cumulativePrincipalPaid, 0)),
    };
  });

  // Also compute current totals
  const currentTotals = {
    totalValue: round(propertyProjections.reduce((s, p) => s + p.currentValue, 0)),
    totalBalance: round(propertyProjections.reduce((s, p) => s + p.currentBalance, 0)),
    totalEquity: round(
      propertyProjections.reduce((s, p) => s + (p.currentValue - p.currentBalance), 0)
    ),
    monthlyPaymentTotal: round(
      propertyProjections.reduce((s, p) => s + p.monthlyPayment, 0)
    ),
  };

  res.json({
    asOf: today.toISOString().split("T")[0],
    properties: propertyProjections,
    totals,
    currentTotals,
  });
});

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export default router;
