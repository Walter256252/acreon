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
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";

const MILESTONES = [5, 10, 15, 20, 30];

const GROWTH_RATES = [
  { rate: 2, label: "2%", color: "#38bdf8", gradId: "gradGrowth2" },
  { rate: 4, label: "4%", color: "#a78bfa", gradId: "gradGrowth4" },
  { rate: 6, label: "6%", color: "#fb923c", gradId: "gradGrowth6" },
] as const;

type GrowthRate = 2 | 4 | 6;

/** Apply compound annual growth to a base value over N years. */
function applyGrowth(baseValue: number, ratePercent: number, years: number): number {
  return baseValue * Math.pow(1 + ratePercent / 100, years);
}

export default function Projections() {
  const { data, isLoading, isError } = useGetProjections();
  const [expandedProperty, setExpandedProperty] = useState<number | null>(null);
  const [activeRates, setActiveRates] = useState<Set<GrowthRate>>(new Set());

  function toggleRate(rate: GrowthRate) {
    setActiveRates((prev) => {
      const next = new Set(prev);
      if (next.has(rate)) next.delete(rate);
      else next.add(rate);
      return next;
    });
  }

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

  // Build chart data: today + each milestone, including growth scenarios
  const chartData = [
    {
      label: "Today",
      equity: currentTotals.totalEquity,
      debt: currentTotals.totalBalance,
      interestPaid: 0,
      // Growth scenarios all start at current equity (no years elapsed)
      equity2: currentTotals.totalEquity,
      equity4: currentTotals.totalEquity,
      equity6: currentTotals.totalEquity,
    },
    ...MILESTONES.map((yr) => {
      const t = totals.find((t) => t.years === yr)!;
      const growthEquity = (rate: number) =>
        applyGrowth(totalValueStart, rate, yr) - t.totalRemainingBalance;
      return {
        label: `${yr}yr`,
        equity: t.totalEquity,
        debt: t.totalRemainingBalance,
        interestPaid: t.totalInterestPaid,
        equity2: growthEquity(2),
        equity4: growthEquity(4),
        equity6: growthEquity(6),
      };
    }),
  ];

  const anyGrowthActive = activeRates.size > 0;

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

      {/* ── Growth rate toggles ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Market Appreciation Scenarios</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Toggle annual growth rates to overlay projected property value appreciation
              from inflation and market growth onto the chart and milestone cards.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
            {GROWTH_RATES.map(({ rate, label, color }) => {
              const isOn = activeRates.has(rate as GrowthRate);
              return (
                <button
                  key={rate}
                  onClick={() => toggleRate(rate as GrowthRate)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-all duration-150",
                    isOn
                      ? "text-white border-transparent shadow-sm"
                      : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  )}
                  style={isOn ? { backgroundColor: color, borderColor: color } : {}}
                >
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full transition-opacity",
                      isOn ? "opacity-100 bg-white/60" : "opacity-0"
                    )}
                  />
                  {label} / yr
                </button>
              );
            })}
            {anyGrowthActive && (
              <button
                onClick={() => setActiveRates(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>
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

      {/* Portfolio trajectory chart */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-1">Portfolio Trajectory</h2>
        {anyGrowthActive && (
          <p className="text-xs text-muted-foreground mb-4">
            Dashed lines show projected equity with annual property value appreciation applied.
            Debt paydown schedule is unchanged.
          </p>
        )}
        {!anyGrowthActive && <div className="mb-4" />}
        <div className="rounded-xl border border-border bg-card p-5">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 16, bottom: 0 }}>
              <defs>
                <linearGradient id="gradEquity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradDebt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradInterest" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.6} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) =>
                  v >= 1_000_000
                    ? `${(v / 1_000_000).toFixed(1)}M`
                    : `${(v / 1_000).toFixed(0)}K`
                }
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={64}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    equity: "Equity (no growth)",
                    debt: "Debt Remaining",
                    interestPaid: "Interest Paid",
                    equity2: "Equity @ 2%/yr growth",
                    equity4: "Equity @ 4%/yr growth",
                    equity6: "Equity @ 6%/yr growth",
                  };
                  return [formatCurrency(value), labels[name] ?? name];
                }}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ fontWeight: 600, marginBottom: 4 }}
              />
              <Legend
                formatter={(value) => {
                  const labels: Record<string, string> = {
                    equity: "Equity (no growth)",
                    debt: "Debt Remaining",
                    interestPaid: "Interest Paid",
                    equity2: "Equity @ 2%/yr",
                    equity4: "Equity @ 4%/yr",
                    equity6: "Equity @ 6%/yr",
                  };
                  return labels[value] ?? value;
                }}
                wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
              />

              {/* Base equity area */}
              <Area
                type="monotone"
                dataKey="equity"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#gradEquity)"
                dot={{ r: 4, fill: "#10b981", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
              {/* Debt area */}
              <Area
                type="monotone"
                dataKey="debt"
                stroke="#f43f5e"
                strokeWidth={2}
                fill="url(#gradDebt)"
                dot={{ r: 4, fill: "#f43f5e", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
              {/* Interest area */}
              <Area
                type="monotone"
                dataKey="interestPaid"
                stroke="#f59e0b"
                strokeWidth={2}
                fill="url(#gradInterest)"
                dot={{ r: 4, fill: "#f59e0b", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />

              {/* Growth scenario lines — only rendered when toggled on */}
              {activeRates.has(2) && (
                <Line
                  type="monotone"
                  dataKey="equity2"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                  dot={{ r: 4, fill: "#38bdf8", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              )}
              {activeRates.has(4) && (
                <Line
                  type="monotone"
                  dataKey="equity4"
                  stroke="#a78bfa"
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                  dot={{ r: 4, fill: "#a78bfa", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              )}
              {activeRates.has(6) && (
                <Line
                  type="monotone"
                  dataKey="equity6"
                  stroke="#fb923c"
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                  dot={{ r: 4, fill: "#fb923c", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

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

            // Growth-adjusted equity = appreciated value - remaining debt
            const growthEquity = (rate: number) =>
              applyGrowth(totalValueStart, rate, yr) - t.totalRemainingBalance;
            const growthValue = (rate: number) =>
              applyGrowth(totalValueStart, rate, yr);

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

                    {/* Growth scenario equity rows */}
                    {anyGrowthActive && (
                      <div className="mt-2 space-y-1 border-t border-border pt-2">
                        {GROWTH_RATES.filter(({ rate }) => activeRates.has(rate as GrowthRate)).map(({ rate, label, color }) => (
                          <div key={rate} className="flex items-center justify-between gap-1">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: color }} />
                              {label}/yr
                            </span>
                            <span className="text-xs font-semibold font-mono" style={{ color }}>
                              {formatCurrency(growthEquity(rate))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Portfolio value with growth */}
                  {anyGrowthActive && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Projected Value
                      </p>
                      <p className="text-sm font-semibold font-mono text-foreground">
                        {formatCurrency(t.totalValue)}
                        <span className="text-xs font-normal text-muted-foreground ml-1">baseline</span>
                      </p>
                      <div className="mt-1 space-y-1">
                        {GROWTH_RATES.filter(({ rate }) => activeRates.has(rate as GrowthRate)).map(({ rate, label, color }) => (
                          <div key={rate} className="flex items-center justify-between gap-1">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: color }} />
                              {label}/yr
                            </span>
                            <span className="text-xs font-semibold font-mono" style={{ color }}>
                              {formatCurrency(growthValue(rate))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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
                  {!anyGrowthActive && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Interest Paid
                      </p>
                      <p className="text-sm font-bold font-mono text-destructive/80">
                        {formatCurrency(t.totalInterestPaid)}
                      </p>
                    </div>
                  )}

                  {/* Principal paid */}
                  {!anyGrowthActive && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1 flex items-center gap-1">
                        <Building className="w-3 h-3" /> Principal Paid
                      </p>
                      <p className="text-sm font-bold font-mono text-foreground">
                        {formatCurrency(t.totalPrincipalPaid)}
                      </p>
                    </div>
                  )}
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
                          <td className="px-5 py-3 text-muted-foreground">Equity (no growth)</td>
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
                        {/* Per-property growth equity rows */}
                        {GROWTH_RATES.filter(({ rate }) => activeRates.has(rate as GrowthRate)).map(({ rate, label, color }) => (
                          <tr key={rate} className="hover:bg-muted/20">
                            <td className="px-5 py-3">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                Equity @ {label}/yr
                              </span>
                            </td>
                            {prop.snapshots.map((s) => {
                              const projectedValue = applyGrowth(prop.currentValue, rate, s.years);
                              const projectedEquity = projectedValue - s.remainingBalance;
                              return (
                                <td key={s.years} className="px-5 py-3 text-right font-mono font-semibold" style={{ color }}>
                                  {formatCurrency(projectedEquity)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
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
