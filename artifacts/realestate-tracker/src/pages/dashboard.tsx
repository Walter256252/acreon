import { useGetDashboard } from "@workspace/api-client-react";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Building, DollarSign, PieChart, Landmark, TrendingUp, BadgeDollarSign, ArrowUpRight } from "lucide-react";
import { PortfolioChat } from "@/components/portfolio-chat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

export default function Dashboard() {
  const { data, isLoading, isError } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-center text-destructive">
        <h2 className="text-xl font-bold">Failed to load dashboard</h2>
        <p className="mt-2 text-muted-foreground">Please check your connection and try again.</p>
      </div>
    );
  }

  const equityPct = data.totalPortfolioValue > 0
    ? (data.totalEquity / data.totalPortfolioValue) * 100
    : 0;

  const appreciationPct = data.totalPurchasePrice > 0
    ? (data.totalAppreciation / data.totalPurchasePrice) * 100
    : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Portfolio Overview</h1>
        <p className="text-muted-foreground mt-1 text-sm">Real-time valuation and equity breakdown across {data.totalProperties} {data.totalProperties === 1 ? "property" : "properties"}.</p>
      </div>

      {/* Row 1 — value & debt */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Portfolio Value"
          value={formatCurrency(data.totalPortfolioValue)}
          icon={<Building className="w-5 h-5" />}
          subtext={`${data.totalProperties} ${data.totalProperties === 1 ? "property" : "properties"}`}
        />
        <StatCard
          title="Total Equity"
          value={formatCurrency(data.totalEquity)}
          icon={<PieChart className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />}
          trend="up"
          trendValue={`${formatPercent(equityPct)} of value`}
        />
        <StatCard
          title="Total Debt Remaining"
          value={formatCurrency(data.totalLoanBalance)}
          icon={<Landmark className="w-5 h-5 text-destructive" />}
          subtext="outstanding mortgage balances"
        />
        <StatCard
          title="Monthly Obligations"
          value={formatCurrency(data.monthlyPaymentTotal)}
          icon={<DollarSign className="w-5 h-5" />}
          subtext="P&I across all loans"
        />
      </div>

      {/* Row 2 — financing & appreciation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Originally Financed"
          value={formatCurrency(data.totalOriginalLoan)}
          icon={<BadgeDollarSign className="w-5 h-5 text-muted-foreground" />}
          subtext="total original loan amounts"
        />
        <StatCard
          title="Principal Paid Down"
          value={formatCurrency(data.totalPrincipalPaid)}
          icon={<TrendingUp className="w-5 h-5 text-primary" />}
          subtext={`${formatPercent(data.totalOriginalLoan > 0 ? (data.totalPrincipalPaid / data.totalOriginalLoan) * 100 : 0)} of original debt retired`}
        />
        <StatCard
          title="Value Appreciation"
          value={formatCurrency(data.totalAppreciation)}
          icon={<ArrowUpRight className="w-5 h-5 text-emerald-600" />}
          subtext={`${appreciationPct >= 0 ? "+" : ""}${formatPercent(appreciationPct)} vs. purchase price of ${formatCurrency(data.totalPurchasePrice)}`}
        />
      </div>

      {/* Per-property equity breakdown */}
      {data.properties.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <PieChart className="w-4 h-4 text-primary" />
              Equity by Property
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Property</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Current Value</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Remaining Debt</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Equity</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground w-36">Equity %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.properties.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/app/properties/${p.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatCurrency(p.currentValue)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(p.estimatedBalance)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(p.equity)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${Math.max(0, Math.min(100, p.equityPercent))}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium tabular-nums w-10 text-right">
                            {formatPercent(p.equityPercent)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {data.properties.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/20">
                      <td className="px-4 py-2.5 font-semibold text-foreground">Total</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">{formatCurrency(data.totalPortfolioValue)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-muted-foreground">{formatCurrency(data.totalLoanBalance)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(data.totalEquity)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${Math.max(0, Math.min(100, equityPct))}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold tabular-nums w-10 text-right">
                            {formatPercent(equityPct)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <PortfolioChat />
    </div>
  );
}
