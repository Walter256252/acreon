import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useListProperties } from "@workspace/api-client-react";
import { TX_TYPE_LABELS, type TxType, isOutflow } from "./categories";

// ── Types ─────────────────────────────────────────────────────────────────

interface Property { id: number; name: string; }
interface Transaction {
  id: number;
  propertyId: number | null;
  date: string;
  description: string;
  amount: number;
  type: string;
  category: string;
  vendorPayer: string | null;
  notes: string | null;
  rentalType: string | null;
  taxYear: number | null;
  isReviewed: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt$(n: number, signed = false) {
  const s = Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  if (!signed) return s;
  return n < 0 ? `(${s})` : s;
}

function currentYear() { return new Date().getFullYear(); }
function yearRange() {
  const y = currentYear();
  return Array.from({ length: 5 }, (_, i) => y - i);
}

// ── Section table ─────────────────────────────────────────────────────────

function ReportSection({
  title,
  rows,
  total,
  totalLabel,
  isExpense,
}: {
  title: string;
  rows: { label: string; amount: number }[];
  total: number;
  totalLabel: string;
  isExpense?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/30">
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {rows.map(r => (
            <tr key={r.label} className="hover:bg-muted/20">
              <td className="px-5 py-2.5 text-foreground">{r.label}</td>
              <td className={cn("px-5 py-2.5 text-right", isExpense ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400")}>
                {fmt$(r.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/30">
            <td className="px-5 py-3 font-semibold text-foreground">{totalLabel}</td>
            <td className={cn("px-5 py-3 text-right font-bold", isExpense ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400")}>
              {fmt$(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Property P&L block ────────────────────────────────────────────────────

function PropertyPL({
  propName,
  txs,
}: {
  propName: string;
  txs: Transaction[];
}) {
  const byCategory = new Map<string, { type: string; amount: number }>();
  for (const tx of txs) {
    const existing = byCategory.get(tx.category);
    if (existing) existing.amount += tx.amount;
    else byCategory.set(tx.category, { type: tx.type, amount: tx.amount });
  }

  const incomeRows: { label: string; amount: number }[] = [];
  const expenseRows: { label: string; amount: number }[] = [];
  const loanRows: { label: string; amount: number }[] = [];
  const otherRows: { label: string; amount: number }[] = [];

  for (const [cat, { type, amount }] of byCategory.entries()) {
    const row = { label: cat, amount };
    if (type === "income") incomeRows.push(row);
    else if (type === "expense") expenseRows.push(row);
    else if (type === "loan_payment") loanRows.push(row);
    else otherRows.push(row);
  }

  const totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.amount, 0);
  const totalLoan = loanRows.reduce((s, r) => s + r.amount, 0);
  const noi = totalIncome - totalExpense;
  const cashFlow = noi - totalLoan;

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-foreground text-base border-b border-border pb-2">{propName}</h3>
      {incomeRows.length > 0 && (
        <ReportSection
          title="Income"
          rows={incomeRows.sort((a, b) => b.amount - a.amount)}
          total={totalIncome}
          totalLabel="Total Income"
        />
      )}
      {expenseRows.length > 0 && (
        <ReportSection
          title="Operating Expenses"
          rows={expenseRows.sort((a, b) => b.amount - a.amount)}
          total={totalExpense}
          totalLabel="Total Operating Expenses"
          isExpense
        />
      )}
      {loanRows.length > 0 && (
        <ReportSection
          title="Loan Payments"
          rows={loanRows}
          total={totalLoan}
          totalLabel="Total Loan Payments"
          isExpense
        />
      )}
      {otherRows.length > 0 && (
        <ReportSection
          title="Other Activity"
          rows={otherRows}
          total={otherRows.reduce((s, r) => s + r.amount, 0)}
          totalLabel="Total"
        />
      )}

      {/* Summary */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Net Operating Income</span>
          <span className={cn("font-semibold", noi >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
            {fmt$(noi)}
          </span>
        </div>
        {totalLoan > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Less: Loan Payments</span>
            <span className="text-muted-foreground">({fmt$(totalLoan)})</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border/50 pt-2">
          <span className="font-semibold text-foreground">Cash Flow</span>
          <span className={cn("font-bold", cashFlow >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
            {fmt$(cashFlow)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function FinancesReport() {
  const { data: properties = [] } = useListProperties();
  const [taxYear, setTaxYear] = useState(String(currentYear()));
  const [propFilter, setPropFilter] = useState("");

  const params = new URLSearchParams({ taxYear });
  if (propFilter) params.set("propertyId", propFilter);

  const { data: txs = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/finances/transactions", "report", taxYear, propFilter],
    queryFn: () =>
      fetch(`/api/finances/transactions?${params.toString()}`).then(r => r.json()),
  });

  const propMap = new Map(properties.map(p => [p.id, p.name]));

  // Group by property
  const byProp = new Map<string, { key: string; name: string; txs: Transaction[] }>();
  for (const tx of txs) {
    const key = tx.propertyId != null ? String(tx.propertyId) : "unassigned";
    const name = tx.propertyId != null ? (propMap.get(tx.propertyId) ?? `Property #${tx.propertyId}`) : "Unassigned";
    if (!byProp.has(key)) byProp.set(key, { key, name, txs: [] });
    byProp.get(key)!.txs.push(tx);
  }

  const groups = Array.from(byProp.values());

  const downloadUrl = `/api/finances/report.csv?taxYear=${taxYear}${propFilter ? `&propertyId=${propFilter}` : ""}`;

  const unreviewedCount = txs.filter(t => !t.isReviewed).length;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Tax Year</label>
            <select
              value={taxYear}
              onChange={e => setTaxYear(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {yearRange().map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Property</label>
            <select
              value={propFilter}
              onChange={e => setPropFilter(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All properties</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <a
          href={downloadUrl}
          download
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download CSV
        </a>
      </div>

      {/* Unreviewed warning */}
      {unreviewedCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 text-sm text-amber-800 dark:text-amber-400">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            <span className="font-semibold">{unreviewedCount}</span> transaction{unreviewedCount !== 1 ? "s" : ""} in this report
            {unreviewedCount !== 1 ? " have" : " has"} not been marked reviewed. Confirm all entries before sending to your CPA.
          </span>
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          This report helps organize financial records for review. It does not provide tax, legal, or accounting advice.
          Tax classifications and filing decisions should be reviewed by a qualified CPA or tax professional.
        </span>
      </div>

      {/* Report content */}
      {isLoading ? (
        <div className="space-y-4">{[1, 2].map(i => <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : txs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-medium text-foreground mb-1">No transactions for {taxYear}</p>
          <p className="text-sm text-muted-foreground">Add transactions in the Transactions tab to generate a report.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map(g => (
            <PropertyPL key={g.key} propName={g.name} txs={g.txs} />
          ))}
        </div>
      )}
    </div>
  );
}
