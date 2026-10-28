/** Monthly fixed-rate estimates. loanStartDate is the first payment month.
 * Balances are measured before this month's payment; rows show post-payment balances.
 * Round interest and balances to cents each month, as in a monthly ledger.
 */
export class LoanInputError extends Error {}
export const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function monthIndex(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new LoanInputError("Loan date must be YYYY-MM-DD");
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new LoanInputError("Invalid loan date");
  }
  return year * 12 + month - 1;
}
export function monthDate(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}
export function todayMonth(now = new Date()): string {
  return monthDate(now.getUTCFullYear() * 12 + now.getUTCMonth());
}
export interface LoanOptions {
  loanAmount: number;
  interestRate: number;
  loanTermYears: number;
  loanStartDate: string;
  monthlyPayment: number;
  extraPaymentMonthly?: number;
  extraPayments?: Array<{ paymentNumber: number; amount: number }>;
  loggedByNumber?: Set<number | null>;
  startingBalance?: number;
  dateStartOverride?: string;
}
export function buildAmortizationSchedule(opts: LoanOptions) {
  for (const value of [
    opts.loanAmount,
    opts.startingBalance ?? opts.loanAmount,
    opts.interestRate,
    opts.monthlyPayment,
    opts.extraPaymentMonthly ?? 0,
  ]) {
    if (!Number.isFinite(value) || value < 0)
      throw new LoanInputError(
        "Loan amounts, rates and payments must be finite and nonnegative",
      );
  }
  const months = Math.round(opts.loanTermYears * 12);
  if (
    !Number.isFinite(months) ||
    months < 0 ||
    months > 1200 ||
    Math.abs(months - opts.loanTermYears * 12) > 1e-8
  ) {
    throw new LoanInputError(
      "Loan term must be a whole number of months, between 0 and 1200",
    );
  }
  monthIndex(opts.loanStartDate);
  const start = monthIndex(opts.dateStartOverride ?? opts.loanStartDate);
  const extras = new Map<number, number>();
  for (const extra of opts.extraPayments ?? []) {
    if (
      !Number.isInteger(extra.paymentNumber) ||
      extra.paymentNumber < 1 ||
      !Number.isFinite(extra.amount) ||
      extra.amount < 0
    ) {
      throw new LoanInputError(
        "Extra payments require a positive integer payment number and a nonnegative amount",
      );
    }
    extras.set(
      extra.paymentNumber,
      roundMoney((extras.get(extra.paymentNumber) ?? 0) + extra.amount),
    );
  }
  let balance = roundMoney(opts.startingBalance ?? opts.loanAmount);
  let cumulativeInterest = 0;
  let cumulativePrincipal = 0;
  const schedule = [];
  for (let i = 1; i <= months && balance > 0; i++) {
    const interest = roundMoney((balance * opts.interestRate) / 1200);
    const payment = roundMoney(
      Math.min(
        balance + interest,
        opts.monthlyPayment +
          (opts.extraPaymentMonthly ?? 0) +
          (extras.get(i) ?? 0),
      ),
    );
    // Negative principal explicitly represents unpaid interest added to the debt.
    const principal = roundMoney(payment - interest);
    balance = roundMoney(balance - principal);
    if (![balance, interest, payment].every(Number.isFinite))
      throw new LoanInputError("Loan calculation exceeds supported amounts");
    cumulativeInterest = roundMoney(cumulativeInterest + interest);
    cumulativePrincipal = roundMoney(cumulativePrincipal + principal);
    schedule.push({
      paymentNumber: i,
      paymentDate: monthDate(start + i - 1),
      paymentAmount: payment,
      principalAmount: principal,
      interestAmount: interest,
      remainingBalance: balance,
      cumulativeInterest,
      cumulativePrincipal,
      isLogged: opts.loggedByNumber?.has(i) ?? false,
    });
  }
  return schedule;
}
export type LoanRow = ReturnType<typeof buildAmortizationSchedule>[number];
export function balanceBeforeMonth(
  schedule: LoanRow[],
  initial: number,
  date: string,
): number {
  const target = monthIndex(date);
  let balance = initial;
  for (const row of schedule) {
    if (monthIndex(row.paymentDate) >= target) break;
    balance = row.remainingBalance;
  }
  return balance;
}
export function payoffDate(schedule: LoanRow[]): string | null {
  const last = schedule.at(-1);
  return last?.remainingBalance === 0 ? last.paymentDate : null;
}

export interface LoanProperty {
  loanAmount: string | number;
  interestRate: string | number;
  loanTermYears: number;
  loanStartDate: string;
  monthlyPayment: string | number;
  currentLoanBalance: string | number | null;
  currentLoanBalanceAsOf?: Date | null;
  updatedAt: Date;
  savedExtraMonthly?: string | number | null;
  savedExtraPayments?: unknown;
}
export interface RecordedLoanPayment {
  paymentDate: string;
  remainingBalance: string | number;
  createdAt: Date;
}
export function propertyLoanSnapshot(
  prop: LoanProperty,
  payment?: RecordedLoanPayment,
  now = new Date(),
) {
  if (
    !Number.isFinite(prop.loanTermYears) ||
    prop.loanTermYears <= 0 ||
    prop.loanTermYears > 100
  ) {
    throw new LoanInputError("Loan term must be between 1 month and 100 years");
  }
  const today = todayMonth(now);
  const usePayment =
    payment &&
    (prop.currentLoanBalance == null ||
      (payment.paymentDate >=
        (prop.currentLoanBalanceAsOf ?? now).toISOString().slice(0, 10) &&
        payment.createdAt > (prop.currentLoanBalanceAsOf ?? prop.updatedAt)));
  const hasSnapshot = !!usePayment || prop.currentLoanBalance != null;
  const snapshotMonth = usePayment
    ? monthDate(monthIndex(payment.paymentDate) + 1)
    : hasSnapshot
      ? todayMonth(prop.currentLoanBalanceAsOf ?? now)
      : prop.loanStartDate;
  const anchor = monthDate(
    Math.max(monthIndex(snapshotMonth), monthIndex(prop.loanStartDate)),
  );
  const initial = usePayment
    ? Number(payment.remainingBalance)
    : Number(prop.currentLoanBalance ?? prop.loanAmount);
  const elapsed = Math.max(
    0,
    monthIndex(anchor) - monthIndex(prop.loanStartDate),
  );
  const remainingMonths = Math.max(
    0,
    prop.loanTermYears * 12 - (hasSnapshot ? elapsed : 0),
  );
  const options = {
    loanAmount: Number(prop.loanAmount),
    interestRate: Number(prop.interestRate),
    loanTermYears: remainingMonths / 12,
    loanStartDate: anchor,
    monthlyPayment: Number(prop.monthlyPayment),
    startingBalance: initial,
    extraPaymentMonthly: Number(prop.savedExtraMonthly ?? 0),
    extraPayments: (
      (prop.savedExtraPayments ?? []) as Array<{
        paymentNumber: number;
        amount: number;
      }>
    )
      .filter((e) => !hasSnapshot || e.paymentNumber > elapsed)
      .map((e) => ({
        ...e,
        paymentNumber: e.paymentNumber - (hasSnapshot ? elapsed : 0),
      })),
  };
  // Validate stored extras before filtering past months; invalid entries must not disappear silently.
  buildAmortizationSchedule({
    ...options,
    loanTermYears: 0,
    extraPayments: (prop.savedExtraPayments ?? []) as Array<{
      paymentNumber: number;
      amount: number;
    }>,
  });
  const historical = buildAmortizationSchedule(options);
  const currentBalance = balanceBeforeMonth(historical, initial, today);
  if (hasSnapshot && monthIndex(anchor) < monthIndex(today)) {
    const advanced = monthIndex(today) - monthIndex(anchor);
    options.startingBalance = currentBalance;
    options.loanStartDate = today;
    options.loanTermYears = Math.max(0, remainingMonths - advanced) / 12;
    options.extraPayments = options.extraPayments
      .filter((e) => e.paymentNumber > advanced)
      .map((e) => ({ ...e, paymentNumber: e.paymentNumber - advanced }));
  }
  const schedule = hasSnapshot
    ? buildAmortizationSchedule(options)
    : historical;
  return {
    schedule,
    currentBalance,
    hasSnapshot,
    initial: hasSnapshot ? currentBalance : initial,
    anchor: options.loanStartDate,
    options,
    payoffDate: payoffDate(schedule),
  };
}

export function calculateLoan(options: LoanOptions) {
  if (options.loanTermYears <= 0)
    throw new LoanInputError("Loan term must be positive");
  const schedule = buildAmortizationSchedule(options);
  const baseline = buildAmortizationSchedule({
    ...options,
    extraPaymentMonthly: 0,
    extraPayments: [],
  });
  const sumInterest = (rows: LoanRow[]) =>
    roundMoney(rows.reduce((sum, row) => sum + row.interestAmount, 0));
  const date = payoffDate(schedule);
  const savingsAvailable = !!date && !!payoffDate(baseline);
  return {
    schedule,
    summary: {
      totalPayments: schedule.length,
      totalInterest: sumInterest(schedule),
      totalPrincipal: roundMoney(
        schedule.reduce((sum, row) => sum + row.principalAmount, 0),
      ),
      payoffDate: date ?? "",
      savingsAvailable,
      remainingBalance:
        schedule.at(-1)?.remainingBalance ??
        options.startingBalance ??
        options.loanAmount,
      monthsSaved: savingsAvailable
        ? Math.max(0, baseline.length - schedule.length)
        : 0,
      interestSaved: savingsAvailable
        ? Math.max(0, roundMoney(sumInterest(baseline) - sumInterest(schedule)))
        : 0,
    },
  };
}

/** Freeze the already-reached balance before applying a new forward payment plan.
 * A supplied manual balance remains authoritative. Existing one-time extras keep
 * their original calendar numbering; the route translates newly supplied ones.
 */
export function rebaseLoanPlan(
  existing: LoanProperty,
  changes: Partial<LoanProperty>,
  previous: ReturnType<typeof propertyLoanSnapshot>,
  now = new Date(),
): { currentLoanBalance?: string; currentLoanBalanceAsOf?: Date } {
  if (changes.currentLoanBalance != null) return {};
  const changed =
    ["monthlyPayment", "interestRate", "savedExtraMonthly"].some((key) => {
      const field = key as
        "monthlyPayment" | "interestRate" | "savedExtraMonthly";
      return (
        Object.prototype.hasOwnProperty.call(changes, field) &&
        Number(changes[field] ?? 0) !== Number(existing[field] ?? 0)
      );
    }) || Object.prototype.hasOwnProperty.call(changes, "savedExtraPayments");
  if (!changed) return {};
  // A payment already logged this month resumes next month, not this month again.
  const asOf =
    monthIndex(previous.anchor) > monthIndex(todayMonth(now))
      ? new Date(`${previous.anchor}T00:00:00Z`)
      : now;
  return {
    currentLoanBalance: String(previous.currentBalance),
    currentLoanBalanceAsOf: asOf,
  };
}

export function futureExtraPayments(
  loan: ReturnType<typeof propertyLoanSnapshot>,
  originalStart: string,
  now = new Date(),
) {
  const offset = loan.hasSnapshot
    ? 0
    : Math.max(0, monthIndex(todayMonth(now)) - monthIndex(originalStart));
  return loan.options.extraPayments
    .filter((e) => e.paymentNumber > offset)
    .map((e) => ({ ...e, paymentNumber: e.paymentNumber - offset }));
}
export function futureExtraOffset(
  loan: ReturnType<typeof propertyLoanSnapshot>,
  originalStart: string,
  now = new Date(),
): number {
  return Math.max(
    0,
    Math.max(monthIndex(loan.anchor), monthIndex(todayMonth(now))) -
      monthIndex(originalStart),
  );
}
