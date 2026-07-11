import { useState } from "react";
import { useGetProjections } from "@workspace/api-client-react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import {
  TrendingUp,
  Building,
  DollarSign,
  Landmark,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MILESTONES = [5, 10, 15, 20, 30];

export default function Projections() {
  const { data, isLoading, isError } = useGetProjections();
  const [expandedProperty, setExpandedProperty] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="h-10 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {MILESTONES.map((m) => (
            <div key={m} className="h-56 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="h-48 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-center text-destructive">
        <h2 className="text-xl font-bold">Failed to load projections</h2>
        <p className="mt-2 text-muted-foreground">Please check your connection and try again.</p>
      </div>
    );
  }

  const { properties, totals, currentTotals, asOf } = data;
  const totalDebtStart = currentTotals.totalBalance;
  const totalValueStart = currentTotals.totalValue;

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <TrendingUp className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Projections</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Portfolio outlook at 5, 10, 15, 20 &amp; 30 year milestones — as of {asOf}
        </p>
      </div>

      {/* TODAY baseline */}
      <div className="rounded-xl border border-border bg-muted/30 px-5 py-4 flex flex-wrap gap-6 items-center">
        <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Today</div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Portfolio Value</p>
          <p className="font-bold font-mono text-foreground">{formatCurrency(currentTotals.totalValue)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Total Debt</p>
          <p className="font-bold font-mono text-foreground">{formatCurrency(currentTotals.totalBalance)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Total Equity</p>
          <p className="font-bold font-mono text-emerald-600 dark:text-emerald-500">{formatCurrency(currentTotals.totalEquity)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Equity %</p>
          <p className="font-bold font-mono text-foreground">
            {formatPercent(totalValueStart > 0 ? (currentTotals.totalEquity / totalValueStart) * 100 : 0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Monthly Payments</p>
          <p className="font-bold font-mono text-foreground">{formatCurrency(currentTotals.monthlyPaymentTotal)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Properties</p>
          <p className="font-bold font-mono text-foreground">{properties.length}</p>
        </div>
      </div>

      {/* Milestone cards — one per horizon */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-4">Portfolio at Each Milestone</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {MILESTONES.map((yr) => {
            const t = totals.find((t) => t.years === yr)!;
            const equityPct = t.totalValue > 0 ? (t.totalEquity / t.totalValue) * 100 : 0;
            const debtReduced = totalDebtStart - t.totalRemainingBalance;
            const debtReducedPct = totalDebtStart > 0 ? (debtReduced / totalDebtStart) * 100 : 0;
            const allPaidOff = t.totalRemainingBalance === 0;

            return (
              <div
                key={yr}
                className={cn(
                  "rounded-xl border bg-card flex flex-col gap-0 overflow-hidden",
                  yr === 30 && allPaidOff
                    ? "border-emerald-500/40 ring-1 ring-emerald-500/20"
                    : "border-border"
                )}
              >
                {/* Milestone badge */}
                <div
                  className={cn(
                    "px-4 py-3 flex items-center justify-between",
                    yr === 30 && allPaidOff
                      ? "bg-emerald-500/10"
                      : "bg-muted/40"
                  )}
                >
                  <span className="text-2xl font-extrabold text-foreground tracking-tight">
                    {yr}<span className="text-sm font-semibold text-muted-foreground ml-0.5">yr</span>
                  </span>
                  {allPaidOff && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                      <BadgeCheck className="w-3.5 h-3.5" /> Paid off
                    </span>
                  )}
                </div>

                <div className="px-4 py-4 space-y-4 flex-1">
                  {/* Equity — headline figure */}
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1 flex items-center gap-1">
                      <DollarSign className="w-3 h-3" /> Total Equity
                    </p>
                    <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-500">
                      {formatCurrency(t.totalEquity)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatPercent(equityPct)} of value</p>
                  </div>

                  {/* Debt remaining */}
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1 flex items-center gap-1">
                      <Landmark className="w-3 h-3" /> Debt Remaining
                    </p>
                    {allPaidOff ? (
                      <p className="text-sm font-bold text-emerald-600">$0</p>
                    ) : (
                      <>
                        <p className="text-sm font-bold font-mono text-foreground">
                          {formatCurrency(t.totalRemainingBalance)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatPercent(debtReducedPct)} paid down
                        </p>
                      </>
                    )}
                  </div>

                  {/* Interest paid to date */}
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Interest Paid
                    </p>
                    <p className="text-sm font-bold font-mono text-destructive/80">
                      {formatCurrency(t.totalInterestPaid)}
                    </p>
                  </div>

                  {/* Principal paid */}
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1 flex items-center gap-1">
                      <Building className="w-3 h-3" /> Principal Paid
                    </p>
                    <p className="text-sm font-bold font-mono text-foreground">
                      {formatCurrency(t.totalPrincipalPaid)}
                    </p>
                  </div>
                </div>

                {/* Equity progress bar */}
                <div className="px-4 pb-4">
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(equityPct, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Per-property detail — collapsible per property */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <Building className="w-4 h-4 text-primary" />
          Per-Property Breakdown
        </h2>

        <div className="space-y-3">
          {properties.map((prop) => {
            const isOpen = expandedProperty === prop.id;
            const currentEquity = prop.currentValue - prop.currentBalance;
            const currentEquityPct =
              prop.currentValue > 0 ? (currentEquity / prop.currentValue) * 100 : 0;

            return (
              <div key={prop.id} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Clickable header */}
                <button
                  className="w-full px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedProperty(isOpen ? null : prop.id)}
                >
                  <div>
                    <p className="font-bold text-foreground">{prop.name}</p>
                    <p className="text-xs text-muted-foreground">{prop.address}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <span className="text-muted-foreground">
                      <span className="font-semibold text-foreground">{formatCurrency(prop.currentValue)}</span> value
                    </span>
                    <span className="text-muted-foreground">
                      <span className="font-semibold text-foreground">{formatCurrency(prop.currentBalance)}</span> balance
                    </span>
                    <span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-500">
                        {formatCurrency(currentEquity)}
                      </span>
                      <span className="text-muted-foreground"> equity ({formatPercent(currentEquityPct)})</span>
                    </span>
                    <span className="text-muted-foreground">{prop.interestRate}% · {prop.loanTermYears}yr</span>
                    <span className="ml-auto text-muted-foreground">
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </div>
                </button>

                {/* Expanded milestone table */}
                {isOpen && (
                  <div className="border-t border-border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/30 border-b border-border">
                          <th className="text-left px-5 py-2.5 font-semibold text-muted-foreground w-44">Metric</th>
                          {MILESTONES.map((yr) => (
                            <th key={yr} className="text-right px-5 py-2.5 font-semibold text-foreground">
                              {yr}yr
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        <tr className="hover:bg-muted/20">
                          <td className="px-5 py-3 text-muted-foreground">Remaining Balance</td>
                          {prop.snapshots.map((s) => (
                            <td key={s.years} className="px-5 py-3 text-right font-mono">
                              {s.isPaidOff ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                                  <BadgeCheck className="w-3 h-3" /> Paid off
                                </span>
                              ) : (
                                formatCurrency(s.remainingBalance)
                              )}
                            </td>
                          ))}
                        </tr>
                        <tr className="hover:bg-muted/20">
                          <td className="px-5 py-3 text-muted-foreground">Equity</td>
                          {prop.snapshots.map((s) => (
                            <td
                              key={s.years}
                              className={cn(
                                "px-5 py-3 text-right font-mono font-semibold",
                                s.equity >= 0
                                  ? "text-emerald-600 dark:text-emerald-500"
                                  : "text-destructive"
                              )}
                            >
                              {formatCurrency(s.equity)}
                            </td>
                          ))}
                        </tr>
                        <tr className="hover:bg-muted/20">
                          <td className="px-5 py-3 text-muted-foreground">Equity %</td>
                          {prop.snapshots.map((s) => {
                            const pct =
                              prop.currentValue > 0
                                ? (s.equity / prop.currentValue) * 100
                                : 0;
                            return (
                              <td key={s.years} className="px-5 py-3 text-right font-mono text-muted-foreground">
                                {formatPercent(pct)}
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="hover:bg-muted/20">
                          <td className="px-5 py-3 text-muted-foreground">Cumulative Interest</td>
                          {prop.snapshots.map((s) => (
                            <td key={s.years} className="px-5 py-3 text-right font-mono text-destructive/80">
                              {formatCurrency(s.cumulativeInterestPaid)}
                            </td>
                          ))}
                        </tr>
                        <tr className="hover:bg-muted/20">
                          <td className="px-5 py-3 text-muted-foreground">Principal Paid</td>
                          {prop.snapshots.map((s) => (
                            <td key={s.years} className="px-5 py-3 text-right font-mono">
                              {formatCurrency(s.cumulativePrincipalPaid)}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
