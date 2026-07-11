import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { propertiesTable } from "@workspace/db";
import { buildAmortizationSchedule } from "./payments";

const router: IRouter = Router();

const MILESTONES = [5, 10, 15, 20, 30];

router.get("/projections", async (_req, res) => {
  const properties = await db
    .select()
    .from(propertiesTable)
    .orderBy(propertiesTable.name);

  const today = new Date();

  const propertyProjections = properties.map((prop) => {
    const schedule = buildAmortizationSchedule({
      loanAmount: Number(prop.loanAmount),
      interestRate: Number(prop.interestRate),
      loanTermYears: prop.loanTermYears,
      loanStartDate: prop.loanStartDate,
      monthlyPayment: Number(prop.monthlyPayment),
    });

    // Index schedule by payment number for fast lookup
    const scheduleByNumber = new Map(schedule.map((r) => [r.paymentNumber, r]));
    const lastRow = schedule[schedule.length - 1];

    // Calculate how many months have elapsed from loan start to today
    const [startYear, startMonth] = prop.loanStartDate.split("-").map(Number);
    const monthsElapsedToday =
      (today.getFullYear() - startYear) * 12 +
      (today.getMonth() + 1 - startMonth);

    const snapshots = MILESTONES.map((years) => {
      // Months from loan start to this milestone
      const milestonDate = new Date(today);
      milestonDate.setFullYear(milestonDate.getFullYear() + years);
      const monthsToMilestone =
        (milestonDate.getFullYear() - startYear) * 12 +
        (milestonDate.getMonth() + 1 - startMonth);

      // Find the row at or just before this milestone
      const targetPayment = Math.max(1, monthsToMilestone);
      let row = scheduleByNumber.get(targetPayment);

      // If the loan is already paid off before this milestone, use the last row
      const isPaidOff = !row || targetPayment > schedule.length;
      if (isPaidOff) {
        row = lastRow;
      }

      const remainingBalance = isPaidOff ? 0 : (row?.remainingBalance ?? 0);
      const cumulativeInterestPaid = row?.cumulativeInterest ?? lastRow?.cumulativeInterest ?? 0;
      const cumulativePrincipalPaid = row?.cumulativePrincipal ?? lastRow?.cumulativePrincipal ?? 0;
      const equity = Number(prop.currentValue) - remainingBalance;
      const payoffDate = lastRow?.paymentDate;

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

    // Current snapshot (today)
    const currentPaymentNum = Math.max(1, Math.min(monthsElapsedToday, schedule.length));
    const currentRow = scheduleByNumber.get(currentPaymentNum) ?? lastRow;
    const currentBalance = currentRow ? currentRow.remainingBalance : Number(prop.loanAmount);

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
  });

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
