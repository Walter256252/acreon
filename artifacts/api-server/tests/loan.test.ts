import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAmortizationSchedule as build,
  balanceBeforeMonth,
  payoffDate,
  propertyLoanSnapshot,
  monthIndex,
  calculateLoan,
} from "../src/lib/loan.ts";
const options = {
  loanAmount: 100000,
  interestRate: 6,
  loanTermYears: 30,
  loanStartDate: "2026-10-01",
  monthlyPayment: 1000,
};
const now = new Date("2026-10-27T12:00:00Z");
const property = {
  ...options,
  loanStartDate: "2016-10-01",
  currentLoanBalance: "100000",
  currentLoanBalanceAsOf: now,
  updatedAt: now,
};

test("known balance projections count future months, not the age of the original loan", () => {
  const loan = propertyLoanSnapshot(property, undefined, now);
  assert.equal(loan.currentBalance, 100000);
  assert.equal(loan.schedule[0].paymentDate, "2026-10-01");
  assert.ok(
    Math.abs(
      balanceBeforeMonth(loan.schedule, loan.initial, "2031-10-01") - 65114.98,
    ) < 0.1,
  );
  assert.equal(loan.options.loanTermYears, 20);
});
test("a manual balance ages from its own date and unrelated edits do not reset it", () => {
  const loan = propertyLoanSnapshot(
    {
      ...property,
      currentLoanBalanceAsOf: new Date("2026-09-01"),
      updatedAt: now,
    },
    undefined,
    now,
  );
  assert.equal(loan.currentBalance, 99500);
  assert.equal(loan.schedule[0].paymentDate, "2026-10-01");
  assert.equal(loan.schedule[0].remainingBalance, 98997.5);
});
test("newer recorded balances reconcile the loan; older records do not replace a manual snapshot", () => {
  const record = {
    paymentDate: "2026-10-27",
    remainingBalance: "90000",
    createdAt: new Date("2026-10-28"),
  };
  const loan = propertyLoanSnapshot(property, record, now);
  assert.equal(loan.currentBalance, 90000);
  assert.equal(loan.anchor, "2026-11-01");
  assert.equal(
    propertyLoanSnapshot(
      property,
      { ...record, paymentDate: "2026-10-15" },
      now,
    ).currentBalance,
    100000,
  );
  assert.equal(
    propertyLoanSnapshot(
      property,
      { ...record, paymentDate: "2020-01-01" },
      now,
    ).currentBalance,
    100000,
  );
});
test("underpayments preserve the actual payment and capitalize unpaid interest", () => {
  const rows = build({ ...options, monthlyPayment: 400 });
  assert.equal(rows[0].paymentAmount, 400);
  assert.equal(rows[0].interestAmount, 500);
  assert.equal(rows[0].principalAmount, -100);
  assert.equal(rows[0].remainingBalance, 100100);
  assert.equal(payoffDate(rows), null);
});
test("term end with debt retains the balance at later milestones and has no payoff date", () => {
  const rows = build({ ...options, loanTermYears: 1 });
  assert.ok(Math.abs(rows.at(-1)!.remainingBalance - 93832.22) < 0.1);
  assert.equal(payoffDate(rows), null);
  assert.equal(
    balanceBeforeMonth(rows, 100000, "2040-01-01"),
    rows.at(-1)!.remainingBalance,
  );
});
test("zero interest, final partial payment, and one-payment payoff", () => {
  const rows = build({ ...options, loanAmount: 2500, interestRate: 0 });
  assert.equal(rows.length, 3);
  assert.equal(rows[2].paymentAmount, 500);
  assert.equal(payoffDate(rows), "2026-12-01");
  assert.equal(
    payoffDate(build({ ...options, loanAmount: 100 })),
    "2026-10-01",
  );
  assert.deepEqual(build({ ...options, loanAmount: 0 }), []);
});
test("saved monthly and duplicate one-time extras are applied and improve payoff", () => {
  const loan = propertyLoanSnapshot(
    {
      ...property,
      savedExtraMonthly: "200",
      savedExtraPayments: [
        { paymentNumber: 121, amount: 100 },
        { paymentNumber: 121, amount: 150 },
      ],
    },
    undefined,
    now,
  );
  assert.equal(loan.schedule[0].principalAmount, 950);
  assert.ok(loan.schedule.length < build(options).length);
});
test("future loans have no payments deducted, and date parsing is timezone-independent", () => {
  const loan = propertyLoanSnapshot(
    { ...property, currentLoanBalance: null, loanStartDate: "2027-01-01" },
    undefined,
    now,
  );
  assert.equal(loan.currentBalance, 100000);
  assert.equal(
    balanceBeforeMonth(loan.schedule, loan.initial, "2027-01-01"),
    100000,
  );
  assert.equal(
    balanceBeforeMonth(loan.schedule, loan.initial, "2027-02-01"),
    99500,
  );
  assert.equal(monthIndex("2027-01-01") - monthIndex("2026-12-01"), 1);
});
test("invalid dates, rates, payment numbers and excessive terms are rejected", () => {
  for (const override of [
    { interestRate: -1 },
    { loanAmount: Infinity },
    { monthlyPayment: -1 },
    { loanStartDate: "2026-02-30" },
    { loanTermYears: 101 },
    { extraPayments: [{ paymentNumber: 1.5, amount: 1 }] },
    { extraPaymentMonthly: -1 },
  ]) {
    assert.throws(() => build({ ...options, ...override }));
  }
});
test("every row reconciles to cents", () => {
  let balance = options.loanAmount;
  for (const row of build({ ...options, monthlyPayment: 599.55 })) {
    assert.ok(
      Math.abs(row.paymentAmount - row.principalAmount - row.interestAmount) <
        0.001,
    );
    assert.ok(
      Math.abs(balance - row.principalAmount - row.remainingBalance) < 0.001,
    );
    balance = row.remainingBalance;
  }
});

test("calculator exposes outstanding debt and withholds unsupported savings", () => {
  const result = calculateLoan({ ...options, loanTermYears: 1 });
  assert.equal(result.summary.payoffDate, "");
  assert.equal(result.summary.savingsAvailable, false);
  assert.equal(result.summary.monthsSaved, 0);
  assert.ok(result.summary.remainingBalance > 93000);
  const paid = calculateLoan({ ...options, extraPaymentMonthly: 200 });
  assert.equal(paid.summary.savingsAvailable, true);
  assert.equal(paid.summary.remainingBalance, 0);
  assert.ok(paid.summary.monthsSaved > 0);
  assert.ok(paid.summary.interestSaved > 0);
});
test("one-time extras remain on their calendar month and do not replay after a snapshot advances", () => {
  const snapshot = {
    ...property,
    currentLoanBalanceAsOf: new Date("2026-09-01"),
    savedExtraPayments: [
      { paymentNumber: 120, amount: 100 },
      { paymentNumber: 121, amount: 200 },
    ],
  };
  const loan = propertyLoanSnapshot(snapshot, undefined, now);
  assert.equal(loan.currentBalance, 99400);
  assert.deepEqual(loan.options.extraPayments, [
    { paymentNumber: 1, amount: 200 },
  ]);
  assert.equal(loan.schedule[0].principalAmount, 703);
});
test("matured snapshot debt is not assigned a fabricated new repayment term", () => {
  const loan = propertyLoanSnapshot(
    { ...property, loanTermYears: 5 },
    undefined,
    now,
  );
  assert.equal(loan.currentBalance, 100000);
  assert.equal(loan.schedule.length, 0);
  assert.equal(loan.payoffDate, null);
});

test("a known balance does not start payments before the first payment month", () => {
  const loan = propertyLoanSnapshot(
    { ...property, loanStartDate: "2027-01-01" },
    undefined,
    now,
  );
  assert.equal(loan.anchor, "2027-01-01");
  assert.equal(loan.currentBalance, 100000);
  assert.equal(loan.schedule[0].paymentDate, "2027-01-01");
});

test("new monthly extras preserve today's balance instead of changing past payments", async () => {
  const { rebaseLoanPlan } = await import("../src/lib/loan.ts");
  const old = {
    ...property,
    currentLoanBalanceAsOf: new Date("2026-09-01"),
    savedExtraMonthly: 0,
  };
  const before = propertyLoanSnapshot(old, undefined, now);
  const changes = { savedExtraMonthly: 200 };
  const rebased = {
    ...old,
    ...changes,
    ...rebaseLoanPlan(old, changes, before, now),
  };
  const after = propertyLoanSnapshot(rebased, undefined, now);
  assert.equal(before.currentBalance, 99500);
  assert.equal(after.currentBalance, before.currentBalance);
  assert.equal(after.schedule[0].principalAmount, 702.5);
  const later = propertyLoanSnapshot(
    rebased,
    undefined,
    new Date("2026-11-01"),
  );
  assert.equal(later.currentBalance, 98797.5);
});
test("payment and interest changes start from the old balance, including originally estimated loans", async () => {
  const { rebaseLoanPlan } = await import("../src/lib/loan.ts");
  for (const old of [property, { ...property, currentLoanBalance: null }]) {
    const before = propertyLoanSnapshot(old, undefined, now);
    for (const changes of [
      { monthlyPayment: 1200 },
      { interestRate: 7 },
      { savedExtraMonthly: null },
    ]) {
      const prior = { ...old, savedExtraMonthly: 100 };
      const previous = propertyLoanSnapshot(prior, undefined, now);
      const after = propertyLoanSnapshot(
        {
          ...prior,
          ...changes,
          ...rebaseLoanPlan(prior, changes, previous, now),
        },
        undefined,
        now,
      );
      assert.equal(after.currentBalance, previous.currentBalance);
    }
    assert.deepEqual(
      rebaseLoanPlan(old, { monthlyPayment: old.monthlyPayment }, before, now),
      {},
    );
  }
});
test("rebasing respects an explicit manual balance and a payment already logged this month", async () => {
  const { rebaseLoanPlan } = await import("../src/lib/loan.ts");
  const before = propertyLoanSnapshot(
    { ...property, currentLoanBalance: null },
    {
      paymentDate: "2026-10-15",
      remainingBalance: 90000,
      createdAt: now,
    },
    now,
  );
  const patch = rebaseLoanPlan(
    property,
    { savedExtraMonthly: 200 },
    before,
    now,
  );
  const after = propertyLoanSnapshot(
    { ...property, ...patch, savedExtraMonthly: 200 },
    undefined,
    now,
  );
  assert.equal(after.currentBalance, 90000);
  assert.equal(after.anchor, "2026-11-01");
  assert.deepEqual(
    rebaseLoanPlan(
      property,
      { currentLoanBalance: 80000, savedExtraMonthly: 200 },
      before,
      now,
    ),
    {},
  );
  assert.deepEqual(
    rebaseLoanPlan(property, { currentLoanBalance: 0 }, before, now),
    {},
  );
});

test("forward one-time extras keep their calendar dates when an estimated loan is rebased", async () => {
  const { rebaseLoanPlan, futureExtraPayments, futureExtraOffset } =
    await import("../src/lib/loan.ts");
  const old = {
    ...property,
    currentLoanBalance: null,
    savedExtraPayments: [
      { paymentNumber: 120, amount: 50 },
      { paymentNumber: 121, amount: 200 },
    ],
  };
  const before = propertyLoanSnapshot(old, undefined, now);
  assert.deepEqual(futureExtraPayments(before, old.loanStartDate, now), [
    { paymentNumber: 1, amount: 200 },
  ]);
  const offset = futureExtraOffset(before, old.loanStartDate, now);
  assert.equal(offset, 120);
  const changes = {
    savedExtraMonthly: 200,
    savedExtraPayments: [{ paymentNumber: 1 + offset, amount: 300 }],
  };
  const after = propertyLoanSnapshot(
    { ...old, ...changes, ...rebaseLoanPlan(old, changes, before, now) },
    undefined,
    now,
  );
  assert.equal(after.currentBalance, before.currentBalance);
  assert.deepEqual(after.options.extraPayments, [
    { paymentNumber: 1, amount: 300 },
  ]);
});
