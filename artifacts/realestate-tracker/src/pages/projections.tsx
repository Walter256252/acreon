import { useGetProjections } from "@workspace/api-client-react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { TrendingUp, Building, DollarSign, Landmark, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const MILESTONES = [5, 10, 15, 20, 30];

function MilestoneLabel({ years }: { years: number }) {
  return (
    <span className="font-semibold text-foreground">
      {years}yr
    </span>
  );
}

export default function Projections() {
  const { data, isLoading, isError } = useGetProjections();

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="h-10 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
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

      {/* Portfolio Summary Cards (current) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-semibold mb-2">
            <Building className="w-3.5 h-3.5" /> Total Value
          </div>
          <p className="text-2xl font-bold font-mono">{formatCurrency(currentTotals.totalValue)}</p>
          <p className="text-xs text-muted-foreground mt-1">Today</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-semibold mb-2">
            <Landmark className="w-3.5 h-3.5" /> Total Debt
          </div>
          <p className="text-2xl font-bold font-mono">{formatCurrency(currentTotals.totalBalance)}</p>
          <p className="text-xs text-muted-foreground mt-1">Today</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-semibold mb-2">
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Total Equity
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-500">{formatCurrency(currentTotals.totalEquity)}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatPercent(currentTotals.totalValue > 0 ? (currentTotals.totalEquity / currentTotals.totalValue) * 100 : 0)} of value</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-semibold mb-2">
            <DollarSign className="w-3.5 h-3.5" /> Monthly Out
          </div>
          <p className="text-2xl font-bold font-mono">{formatCurrency(currentTotals.monthlyPaymentTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">Combined payments</p>
        </div>
      </div>

      {/* Portfolio Milestone Table */}
      <section>
        <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Portfolio Totals by Milestone
        </h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground w-40">Metric</th>
                  {MILESTONES.map((yr) => (
                    <th key={yr} className="text-right px-5 py-3 font-semibold text-foreground">
                      <MilestoneLabel years={yr} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 text-muted-foreground font-medium">Total Debt Remaining</td>
                  {MILESTONES.map((yr) => {
                    const t = totals.find((t) => t.years === yr)!;
                    return (
                      <td key={yr} className="px-5 py-3 text-right font-mono">
                        {t.totalRemainingBalance === 0 ? (
                          <span className="text-emerald-600 font-semibold text-xs">All Paid Off</span>
                        ) : (
                          formatCurrency(t.totalRemainingBalance)
                        )}
                      </td>
                    );
                  })}
                </tr>
                <tr className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 text-muted-foreground font-medium">Total Equity</td>
                  {MILESTONES.map((yr) => {
                    const t = totals.find((t) => t.years === yr)!;
                    return (
                      <td key={yr} className="px-5 py-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-500">
                        {formatCurrency(t.totalEquity)}
                      </td>
                    );
                  })}
                </tr>
                <tr className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 text-muted-foreground font-medium">Equity %</td>
                  {MILESTONES.map((yr) => {
                    const t = totals.find((t) => t.years === yr)!;
                    const pct = t.totalValue > 0 ? (t.totalEquity / t.totalValue) * 100 : 0;
                    return (
                      <td key={yr} className="px-5 py-3 text-right font-mono text-muted-foreground">
                        {formatPercent(pct)}
                      </td>
                    );
                  })}
                </tr>
                <tr className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 text-muted-foreground font-medium">Total Interest Paid</td>
                  {MILESTONES.map((yr) => {
                    const t = totals.find((t) => t.years === yr)!;
                    return (
                      <td key={yr} className="px-5 py-3 text-right font-mono text-destructive/80">
                        {formatCurrency(t.totalInterestPaid)}
                      </td>
                    );
                  })}
                </tr>
                <tr className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 text-muted-foreground font-medium">Total Principal Paid</td>
                  {MILESTONES.map((yr) => {
                    const t = totals.find((t) => t.years === yr)!;
                    return (
                      <td key={yr} className="px-5 py-3 text-right font-mono">
                        {formatCurrency(t.totalPrincipalPaid)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Per-Property Breakdown */}
      <section className="space-y-6">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Building className="w-4 h-4 text-primary" />
          Per-Property Breakdown
        </h2>

        {properties.map((prop) => {
          const currentEquity = prop.currentValue - prop.currentBalance;
          const currentEquityPct = prop.currentValue > 0 ? (currentEquity / prop.currentValue) * 100 : 0;

          return (
            <div key={prop.id} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Property header */}
              <div className="px-5 py-4 border-b border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="font-bold text-foreground">{prop.name}</h3>
                  <p className="text-xs text-muted-foreground">{prop.address}</p>
                </div>
                <div className="flex flex-wrap gap-4 text-xs">
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-foreground">{formatCurrency(prop.currentValue)}</span> value
                  </span>
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-foreground">{formatCurrency(prop.currentBalance)}</span> balance today
                  </span>
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-500">{formatCurrency(currentEquity)}</span> equity ({formatPercent(currentEquityPct)})
                  </span>
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-foreground">{prop.interestRate}%</span> rate · {prop.loanTermYears}yr term
                  </span>
                </div>
              </div>

              {/* Milestone table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="text-left px-5 py-2.5 font-semibold text-muted-foreground w-44">Metric</th>
                      {MILESTONES.map((yr) => (
                        <th key={yr} className="text-right px-5 py-2.5 font-semibold text-foreground">
                          <MilestoneLabel years={yr} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 text-muted-foreground">Remaining Balance</td>
                      {prop.snapshots.map((s) => (
                        <td key={s.years} className="px-5 py-3 text-right font-mono">
                          {s.isPaidOff ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                              <BadgeCheck className="w-3.5 h-3.5" /> Paid off
                            </span>
                          ) : (
                            formatCurrency(s.remainingBalance)
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-muted/20 transition-colors">
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
                    <tr className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 text-muted-foreground">Equity %</td>
                      {prop.snapshots.map((s) => {
                        const pct = prop.currentValue > 0 ? (s.equity / prop.currentValue) * 100 : 0;
                        return (
                          <td key={s.years} className="px-5 py-3 text-right font-mono text-muted-foreground">
                            {formatPercent(pct)}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 text-muted-foreground">Cumulative Interest</td>
                      {prop.snapshots.map((s) => (
                        <td key={s.years} className="px-5 py-3 text-right font-mono text-destructive/80">
                          {formatCurrency(s.cumulativeInterestPaid)}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-muted/20 transition-colors">
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
            </div>
          );
        })}
      </section>
    </div>
  );
}
