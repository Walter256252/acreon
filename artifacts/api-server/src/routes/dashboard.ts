import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { propertiesTable, paymentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard", async (_req, res) => {
  const properties = await db.select().from(propertiesTable).orderBy(propertiesTable.createdAt);

  // For each property, estimate the current balance based on logged payments
  const summaries = await Promise.all(properties.map(async (prop) => {
    // Get the most recent logged payment to determine current balance
    const [lastPayment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.propertyId, prop.id))
      .orderBy(desc(paymentsTable.paymentNumber))
      .limit(1);

    let estimatedBalance: number;
    if (lastPayment) {
      estimatedBalance = Number(lastPayment.remainingBalance);
    } else {
      // No payments logged, use original loan amount with a basic amortized estimate
      estimatedBalance = Number(prop.loanAmount);
    }

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
    };
  }));

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
