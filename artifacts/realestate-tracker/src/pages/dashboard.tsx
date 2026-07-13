import { useGetDashboard } from "@workspace/api-client-react";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatPercent } from "@/lib/utils";
import {
  Building, DollarSign, PieChart, Landmark, TrendingUp, TrendingDown,
  CalendarCheck, Award, AlertTriangle, BarChart3, Link, LayoutDashboard,
  Home, Lock, Briefcase, ShieldOff, Info,
} from "lucide-react";
import { PortfolioChat } from "@/components/portfolio-chat";
import { useLocation } from "wouter";

// ── tiny insight card ──────────────────────────────────────────────────────
function InsightCard({
  label,
  propertyName,
  value,
  sub,
  icon,
  accent,
  propertyId,
}: {
  label: string;
  propertyName?: string | null;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: "emerald" | "amber" | "blue" | "red" | "violet";
  propertyId?: number;
}) {
  const [, navigate] = useLocation();
  const accentClasses: Record<string, string> = {
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-200",
    amber:   "text-amber-600  bg-amber-50  border-amber-200",
    blue:    "text-blue-600   bg-blue-50   border-blue-200",
    red:     "text-red-600    bg-red-50    border-red-200",
    violet:  "text-violet-600 bg-violet-50 border-violet-200",
  };
  const iconClass = accent ? accentClasses[accent] : "text-muted-foreground bg-muted border-border";

  return (
    <div
      className={`rounded-xl border border-border bg-card p-4 flex flex-col gap-2 ${propertyId ? "hover:border-primary/40 transition-colors" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${iconClass}`}>
          {icon}
        </span>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>

      {propertyName && (
        <button
          onClick={() => propertyId && navigate(`/app/properties/${propertyId}`)}
          className="text-sm font-semibold text-foreground text-left leading-tight hover:text-primary transition-colors flex items-center gap-1 group"
        >
          {propertyName}
          {propertyId && <Link className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />}
        </button>
      )}

      <p className="text-lg font-bold text-foreground leading-none">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── loading skeleton for insight cards ────────────────────────────────────
function InsightSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-muted" />
        <div className="h-3 w-24 bg-muted rounded" />
      </div>
      <div className="h-4 w-32 bg-muted rounded" />
      <div className="h-5 w-20 bg-muted rounded" />
    </div>
  );
}

// ── format payoff date ─────────────────────────────────────────────────────
function formatPayoffDate(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  const now = new Date();
  const months =
    (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  if (months < 12) return `${months}mo`;
  const years = Math.round(months / 12);
  return `${years} yr${years !== 1 ? "s" : ""}`;
}

// ── main page ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data, isLoading, isError } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="h-10 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
        </div>
        <div>
          <div className="h-5 w-32 bg-muted animate-pulse rounded mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => <InsightSkeleton key={i} />)}
          </div>
        </div>
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

  const hasProperties = data.totalProperties > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <LayoutDashboard className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Portfolio Overview</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">Real-time valuation and equity breakdown.</p>
      </div>

      {/* ── top stat cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Value"
          value={formatCurrency(data.totalPortfolioValue)}
          icon={<Building className="w-5 h-5 text-primary" />}
          subtext={`${data.totalProperties} propert${data.totalProperties === 1 ? "y" : "ies"}`}
        />
        <StatCard
          title="Total Debt"
          value={formatCurrency(data.totalLoanBalance)}
          icon={<Landmark className="w-5 h-5 text-primary" />}
        />
        <StatCard
          title="Total Equity"
          value={formatCurrency(data.totalEquity)}
          icon={<PieChart className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />}
          trend="up"
          trendValue={formatPercent(
            data.totalPortfolioValue > 0 ? (data.totalEquity / data.totalPortfolioValue) * 100 : 0
          )}
        />
        <StatCard
          title="Monthly Obligations"
          value={formatCurrency(data.monthlyPaymentTotal)}
          icon={<DollarSign className="w-5 h-5 text-primary" />}
        />
      </div>

      {/* ── property spotlights ──────────────────────────────────── */}
      {hasProperties && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Property Spotlights
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">

            {/* 1. Property count */}
            <InsightCard
              label="Properties"
              value={String(data.totalProperties)}
              sub={`avg ${formatPercent(data.avgEquityPercent ?? 0)} equity`}
              icon={<Building className="w-3.5 h-3.5" />}
              accent="blue"
            />

            {/* 2. Most equity */}
            <InsightCard
              label="Most Equity"
              propertyName={data.mostEquity?.name}
              value={data.mostEquity ? formatCurrency(data.mostEquity.equity) : "—"}
              sub={data.mostEquity ? `${formatPercent(data.mostEquity.equityPercent)} of value` : undefined}
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              accent="emerald"
              propertyId={data.mostEquity?.id}
            />

            {/* 3. Least equity */}
            <InsightCard
              label="Least Equity"
              propertyName={data.leastEquity?.name}
              value={data.leastEquity ? formatCurrency(data.leastEquity.equity) : "—"}
              sub={data.leastEquity ? `${formatPercent(data.leastEquity.equityPercent)} of value` : undefined}
              icon={<TrendingDown className="w-3.5 h-3.5" />}
              accent="amber"
              propertyId={data.leastEquity?.id}
            />

            {/* 4. Next payoff */}
            <InsightCard
              label="Next Payoff"
              propertyName={data.nextPayoff?.name}
              value={data.nextPayoff ? formatPayoffDate(data.nextPayoff.payoffDate) : "—"}
              sub={data.nextPayoff ? `${formatCurrency(data.nextPayoff.estimatedBalance)} remaining` : undefined}
              icon={<CalendarCheck className="w-3.5 h-3.5" />}
              accent="violet"
              propertyId={data.nextPayoff?.id}
            />

            {/* 5. Best appreciation */}
            <InsightCard
              label="Top Appreciator"
              propertyName={data.bestAppreciation?.name}
              value={data.bestAppreciation ? `+${formatPercent(data.bestAppreciation.appreciationPercent)}` : "—"}
              sub={data.bestAppreciation ? `+${formatCurrency(data.bestAppreciation.appreciation)} vs purchase` : undefined}
              icon={<Award className="w-3.5 h-3.5" />}
              accent="emerald"
              propertyId={data.bestAppreciation?.id}
            />

            {/* 6. Highest LTV (risk) */}
            <InsightCard
              label="Highest LTV"
              propertyName={data.highestLTV?.name}
              value={data.highestLTV ? formatPercent(data.highestLTV.ltv) : "—"}
              sub={data.highestLTV ? `${formatCurrency(data.highestLTV.estimatedBalance)} owed` : undefined}
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
              accent="red"
              propertyId={data.highestLTV?.id}
            />

            {/* 7. HOA exposure — only show if at least one property has HOA */}
            {(data.hoaCount ?? 0) > 0 && (
              <InsightCard
                label="HOA Exposure"
                value={formatCurrency(data.totalHoaMonthly ?? 0)}
                sub={`${data.hoaCount} propert${data.hoaCount === 1 ? "y" : "ies"} with HOA`}
                icon={<Home className="w-3.5 h-3.5" />}
                accent="amber"
              />
            )}

            {/* 8. Entity holdings — only show if at least one property is in trust/LLC */}
            {(data.entityCount ?? 0) > 0 && (
              <InsightCard
                label="In Entity"
                value={String(data.entityCount)}
                sub={`of ${data.totalProperties} in trust or LLC`}
                icon={<Lock className="w-3.5 h-3.5" />}
                accent="violet"
              />
            )}

            {/* 9. Managed properties — only show if at least one is professionally managed */}
            {(data.managedCount ?? 0) > 0 && (
              <InsightCard
                label="Managed"
                value={String(data.managedCount)}
                sub={`of ${data.totalProperties} professionally managed`}
                icon={<Briefcase className="w-3.5 h-3.5" />}
                accent="blue"
              />
            )}

            {/* 10. Missing info — only show if there are gaps to fill in */}
            {(data.missingInfoCount ?? 0) > 0 && (
              <InsightCard
                label="Incomplete Info"
                value={String(data.missingInfoCount)}
                sub="missing lender, title, or insurance"
                icon={<Info className="w-3.5 h-3.5" />}
              />
            )}

          </div>
        </div>
      )}

      <PortfolioChat />
    </div>
  );
}
