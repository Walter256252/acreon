import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, Building2, FolderOpen, ExternalLink, Pencil, Check, X, Link, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useListProperties } from "@workspace/api-client-react";

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

// ── Receipt Folder Card ───────────────────────────────────────────────────

function ReceiptFolderCard({
  property,
}: {
  property: { id: number; name: string; receiptFolderUrl: string | null };
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(property.receiptFolderUrl ?? "");

  const save = useMutation({
    mutationFn: async (url: string) => {
      const r = await fetch(`/api/properties/${property.id}/receipt-folder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() || null }),
      });
      if (!r.ok) throw new Error("Failed to save");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      setEditing(false);
    },
  });

  const hasUrl = !!property.receiptFolderUrl;

  if (editing) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
        <FolderOpen className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">{property.name}</p>
          <input
            autoFocus
            type="url"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") save.mutate(draft);
              if (e.key === "Escape") { setEditing(false); setDraft(property.receiptFolderUrl ?? ""); }
            }}
            placeholder="https://drive.google.com/drive/folders/…"
            className="w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          onClick={() => save.mutate(draft)}
          disabled={save.isPending}
          className="w-7 h-7 flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
          title="Save"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => { setEditing(false); setDraft(property.receiptFolderUrl ?? ""); }}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Cancel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn(
      "group flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
      hasUrl
        ? "border-border bg-card hover:bg-muted/30"
        : "border-dashed border-border bg-muted/20 hover:border-primary/30 hover:bg-primary/5",
    )}>
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
        hasUrl ? "bg-primary/10" : "bg-muted",
      )}>
        <FolderOpen className={cn("w-4 h-4", hasUrl ? "text-primary" : "text-muted-foreground")} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{property.name}</p>
        {hasUrl ? (
          <a
            href={property.receiptFolderUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-primary hover:underline truncate"
          >
            <span className="truncate">{property.receiptFolderUrl}</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">No receipt folder linked</p>
        )}
      </div>

      <button
        onClick={() => { setDraft(property.receiptFolderUrl ?? ""); setEditing(true); }}
        className={cn(
          "w-7 h-7 flex items-center justify-center rounded-md transition-colors shrink-0",
          hasUrl
            ? "opacity-0 group-hover:opacity-100 border border-border text-muted-foreground hover:text-foreground"
            : "text-primary hover:bg-primary/10",
        )}
        title={hasUrl ? "Edit link" : "Add receipt folder link"}
      >
        {hasUrl ? <Pencil className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
      </button>
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

  const { data: properties = [] } = useListProperties();

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

  // Properties to show in receipt folder section (filter by selected property if active)
  const receiptProps = properties
    .filter(p => !propertyId || String(p.id) === propertyId)
    .map(p => ({ id: p.id, name: p.name, receiptFolderUrl: (p as any).receiptFolderUrl ?? null }));

  if (!hasAnyData) {
    return (
      <div className="space-y-6">
        {/* Receipt folder links — always visible even with no transactions */}
        {receiptProps.length > 0 && (
          <ReceiptFolderSection props={receiptProps} />
        )}
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <DollarSign className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-medium text-foreground mb-1">No transactions yet</p>
          <p className="text-sm text-muted-foreground">
            Add your first income or expense record in the Transactions tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Receipt folder links */}
      {receiptProps.length > 0 && (
        <ReceiptFolderSection props={receiptProps} />
      )}

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
        <SummaryCard label="Gross Income" value={fmt$(data.grossIncome)} icon={TrendingUp} variant="positive" />
        <SummaryCard label="Operating Expenses" value={fmt$(data.operatingExpenses)} icon={TrendingDown} variant="negative" />
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
        <SummaryCard label="Mortgage Interest" value={fmt$(data.mortgageInterestPaid)} icon={DollarSign} variant="neutral" />
        <SummaryCard label="Mortgage Principal" value={fmt$(data.mortgagePrincipalPaid)} icon={DollarSign} variant="neutral" />
        <SummaryCard label="Capital Improvements" value={fmt$(data.capitalImprovements)} icon={Building2} variant="neutral" />
        {(data.ownerContributions > 0 || data.ownerDraws > 0) && (
          <SummaryCard
            label="Owner Activity"
            value={fmt$(data.ownerContributions - data.ownerDraws)}
            icon={DollarSign}
            variant="neutral"
            sub={`${fmt$(data.ownerContributions)} in / ${fmt$(data.ownerDraws)} out`}
          />
        )}
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

// ── Receipt Folder Section ────────────────────────────────────────────────

function ReceiptFolderSection({
  props,
}: {
  props: Array<{ id: number; name: string; receiptFolderUrl: string | null }>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [focusId, setFocusId] = useState<number | "all">("all");

  const visible = focusId === "all" ? props : props.filter(p => p.id === focusId);

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5" />
            : <ChevronDown className="w-3.5 h-3.5" />}
          <FolderOpen className="w-4 h-4" />
          Receipt Folders
        </button>

        {!collapsed && props.length > 1 && (
          <div className="flex items-center gap-1 ml-2 flex-wrap">
            <button
              onClick={() => setFocusId("all")}
              className={cn(
                "px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors",
                focusId === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              All
            </button>
            {props.map(p => (
              <button
                key={p.id}
                onClick={() => setFocusId(focusId === p.id ? "all" : p.id)}
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors",
                  focusId === p.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {collapsed && (
          <span className="text-xs text-muted-foreground/60">
            · {props.length} propert{props.length === 1 ? "y" : "ies"} hidden
          </span>
        )}
      </div>

      {/* Cards */}
      {!collapsed && (
        <div className={cn(
          "grid gap-2",
          visible.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2",
        )}>
          {visible.map(p => (
            <ReceiptFolderCard key={p.id} property={p} />
          ))}
        </div>
      )}
    </div>
  );
}
