import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────

interface SummaryData {
  grossIncome: number;
  operatingExpenses: number;
  noi: number;
  mortgageInterestPaid: number;
  mortgagePrincipalPaid: number;
  capitalImprovements: number;
  ownerContributions: number;
  ownerDraws: number;
  unreviewed: number;
  totalTransactions: number;
  byProperty: Array<{
    propId: number | null;
    propName: string;
    grossIncome: number;
    operatingExpenses: number;
    mortgagePayments: number;
    capitalImprovements: number;
  }>;
}

interface OverviewProps {
  dateFrom: string;
  dateTo: string;
  propertyId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  variant = "neutral",
  sub,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  variant?: "positive" | "negative" | "neutral" | "warn";
  sub?: string;
}) {
  const colors = {
    positive: "text-emerald-700 dark:text-emerald-400",
    negative: "text-red-600 dark:text-red-400",
    neutral: "text-foreground",
    warn: "text-amber-600 dark:text-amber-400",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className={cn("text-2xl font-bold", colors[variant])}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export default function FinancesOverview({ dateFrom, dateTo, propertyId }: OverviewProps) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (propertyId) params.set("propertyId", propertyId);

  const { data, isLoading } = useQuery<SummaryData>({
    queryKey: ["/api/finances/summary", dateFrom, dateTo, propertyId],
    queryFn: () =>
      fetch(`/api/finances/summary?${params.toString()}`).then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const cashFlow = data.grossIncome - data.operatingExpenses - (data.mortgageInterestPaid + data.mortgagePrincipalPaid);

  const hasAnyData = data.totalTransactions > 0;

  if (!hasAnyData) {
    return (
      <div className="rounded-xl border border-dashed border-border p-16 text-center">
        <DollarSign className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="font-medium text-foreground mb-1">No transactions yet</p>
        <p className="text-sm text-muted-foreground">
          Add your first income or expense record in the Transactions tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Unreviewed banner */}
      {data.unreviewed > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 text-sm text-amber-800 dark:text-amber-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            <span className="font-semibold">{data.unreviewed}</span> transaction
            {data.unreviewed !== 1 ? "s" : ""} need review.
          </span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <SummaryCard
          label="Gross Income"
          value={fmt$(data.grossIncome)}
          icon={TrendingUp}
          variant="positive"
        />
        <SummaryCard
          label="Operating Expenses"
          value={fmt$(data.operatingExpenses)}
          icon={TrendingDown}
          variant="negative"
        />
        <SummaryCard
          label="Net Operating Income"
          value={fmt$(data.noi)}
          icon={DollarSign}
          variant={data.noi >= 0 ? "positive" : "negative"}
          sub="Income minus operating expenses"
        />
        <SummaryCard
          label="Cash Flow"
          value={fmt$(cashFlow)}
          icon={DollarSign}
          variant={cashFlow >= 0 ? "positive" : "negative"}
          sub="After mortgage payments"
        />
        <SummaryCard
          label="Mortgage Interest"
          value={fmt$(data.mortgageInterestPaid)}
          icon={DollarSign}
          variant="neutral"
        />
        <SummaryCard
          label="Mortgage Principal"
          value={fmt$(data.mortgagePrincipalPaid)}
          icon={DollarSign}
          variant="neutral"
        />
        <SummaryCard
          label="Capital Improvements"
          value={fmt$(data.capitalImprovements)}
          icon={Building2}
          variant="neutral"
        />
        {data.ownerContributions > 0 || data.ownerDraws > 0 ? (
          <SummaryCard
            label="Owner Activity"
            value={fmt$(data.ownerContributions - data.ownerDraws)}
            icon={DollarSign}
            variant="neutral"
            sub={`${fmt$(data.ownerContributions)} in / ${fmt$(data.ownerDraws)} out`}
          />
        ) : null}
      </div>

      {/* Per-property table */}
      {data.byProperty.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground">By Property</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Property</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Income</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Expenses</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">NOI</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Debt Payments</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Capital Impr.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.byProperty.map((p) => {
                  const noi = p.grossIncome - p.operatingExpenses;
                  return (
                    <tr key={p.propId ?? "unassigned"} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3 font-medium text-foreground">{p.propName}</td>
                      <td className="px-4 py-3 text-right text-emerald-700 dark:text-emerald-400">{fmt$(p.grossIncome)}</td>
                      <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">{fmt$(p.operatingExpenses)}</td>
                      <td className={cn("px-4 py-3 text-right font-medium", noi >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                        {fmt$(noi)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{fmt$(p.mortgagePayments)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{fmt$(p.capitalImprovements)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20">
                  <td className="px-5 py-3 font-semibold text-foreground">Total</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700 dark:text-emerald-400">{fmt$(data.grossIncome)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600 dark:text-red-400">{fmt$(data.operatingExpenses)}</td>
                  <td className={cn("px-4 py-3 text-right font-semibold", data.noi >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                    {fmt$(data.noi)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-muted-foreground">
                    {fmt$(data.mortgageInterestPaid + data.mortgagePrincipalPaid)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-muted-foreground">{fmt$(data.capitalImprovements)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground text-center">
        This software helps organize financial records. It does not provide tax, legal, or accounting advice.
        Tax classifications and filing decisions should be reviewed by a qualified CPA or tax professional.
      </p>
    </div>
  );
}
