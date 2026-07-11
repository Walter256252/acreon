import { Router, type IRouter } from "express";
import { RunCalculatorBody } from "@workspace/api-zod";
import { buildAmortizationSchedule } from "./payments";

const router: IRouter = Router();

router.post("/calculator", (req, res) => {
  const body = RunCalculatorBody.parse(req.body);

  const {
    loanAmount,
    interestRate,
    loanTermYears,
    loanStartDate,
    monthlyPayment,
    extraPaymentMonthly = 0,
    extraPayments = [],
  } = body;

  const schedule = buildAmortizationSchedule({
    loanAmount,
    interestRate,
    loanTermYears,
    loanStartDate,
    monthlyPayment,
    extraPaymentMonthly,
    extraPayments: extraPayments as Array<{ paymentNumber: number; amount: number }>,
  });

  // Baseline (no extras) for comparison
  const baseline = buildAmortizationSchedule({
    loanAmount,
    interestRate,
    loanTermYears,
    loanStartDate,
    monthlyPayment,
    extraPaymentMonthly: 0,
    extraPayments: [],
  });

  const totalInterest = schedule.reduce((s, r) => s + r.interestAmount, 0);
  const totalPrincipal = schedule.reduce((s, r) => s + r.principalAmount, 0);
  const baselineInterest = baseline.reduce((s, r) => s + r.interestAmount, 0);

  const lastRow = schedule[schedule.length - 1];
  const payoffDate = lastRow?.paymentDate ?? "";
  const monthsSaved = baseline.length - schedule.length;
  const interestSaved = round(baselineInterest - totalInterest);

  res.json({
    schedule,
    summary: {
      totalPayments: schedule.length,
      totalInterest: round(totalInterest),
      totalPrincipal: round(totalPrincipal),
      payoffDate,
      monthsSaved: Math.max(0, monthsSaved),
      interestSaved: Math.max(0, interestSaved),
    },
  });
});

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export default router;
