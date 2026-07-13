import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, CheckCircle, Circle, X, Search, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { useListProperties } from "@workspace/api-client-react";
import { TX_TYPE_LABELS, categoriesForType, type TxType, isOutflow } from "./categories";

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
  paymentAccount: string | null;
  notes: string | null;
  rentalType: string | null;
  taxYear: number | null;
  isReviewed: boolean;
}

interface Props {
  filterPropertyId: string;
  dateFrom: string;
  dateTo: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

const TYPES: TxType[] = [
  "income", "expense", "loan_payment", "owner_contribution", "owner_draw", "capital_improvement",
];

const TYPE_COLORS: Record<string, string> = {
  income: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  expense: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  loan_payment: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  owner_contribution: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  owner_draw: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  capital_improvement: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

// ── Transaction Form ──────────────────────────────────────────────────────

type RecurringFrequency = "monthly" | "quarterly" | "semi_annual" | "annual";

const FREQ_LABELS: Record<RecurringFrequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly (every 3 months)",
  semi_annual: "Semi-Annual (every 6 months)",
  annual: "Annual",
};

const FREQ_MONTHS: Record<RecurringFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  semi_annual: 6,
  annual: 12,
};

/** Given a start date, frequency, and optional custom end date, return all
 *  ISO date strings for each occurrence (inclusive on both ends). */
function buildRecurringDates(
  startDate: string,
  freq: RecurringFrequency,
  endDate?: string,
): string[] {
  if (!startDate) return [];
  const step = FREQ_MONTHS[freq];
  const start = new Date(startDate + "T12:00:00");
  const limit = endDate
    ? new Date(endDate + "T12:00:00")
    : new Date(start.getFullYear(), 11, 31);
  const dates: string[] = [];
  let cur = new Date(start);
  while (cur <= limit) {
    dates.push(cur.toISOString().split("T")[0]);
    cur = new Date(cur.getFullYear(), cur.getMonth() + step, cur.getDate());
  }
  return dates;
}

function fmtDateRange(dates: string[]): string {
  if (!dates.length) return "";
  const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleString("en-US", { month: "short", year: "numeric" });
  if (dates.length === 1) return fmt(dates[0]);
  return `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}`;
}

interface FormState {
  date: string;
  description: string;
  amount: string;
  type: TxType;
  category: string;
  propertyId: string;
  vendorPayer: string;
  paymentAccount: string;
  rentalType: string;
  notes: string;
  isReviewed: boolean;
  isRecurring: boolean;
  recurringFrequency: RecurringFrequency;
  recurringEndType: "end_of_year" | "custom";
  recurringEndDate: string;
}

const emptyForm = (): FormState => ({
  date: new Date().toISOString().split("T")[0],
  description: "",
  amount: "",
  type: "income",
  category: "",
  propertyId: "",
  vendorPayer: "",
  paymentAccount: "",
  rentalType: "",
  notes: "",
  isReviewed: false,
  isRecurring: false,
  recurringFrequency: "monthly",
  recurringEndType: "end_of_year",
  recurringEndDate: "",
});

function txToForm(tx: Transaction): FormState {
  return {
    date: tx.date,
    description: tx.description,
    amount: String(tx.amount),
    type: tx.type as TxType,
    category: tx.category,
    propertyId: tx.propertyId != null ? String(tx.propertyId) : "",
    vendorPayer: tx.vendorPayer ?? "",
    paymentAccount: tx.paymentAccount ?? "",
    rentalType: tx.rentalType ?? "",
    isRecurring: false,
    recurringFrequency: "monthly",
    recurringEndType: "end_of_year",
    recurringEndDate: "",
    notes: tx.notes ?? "",
    isReviewed: tx.isReviewed,
  };
}

function TransactionModal({
  tx,
  properties,
  onClose,
}: {
  tx: Transaction | null;
  properties: Property[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(tx ? txToForm(tx) : emptyForm());
  const [error, setError] = useState("");

  const isNew = !tx;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Reset category when type changes
  const setType = (t: TxType) => setForm((f) => ({ ...f, type: t, category: "" }));

  const categories = categoriesForType(form.type);

  // Recurring date preview
  const recurringDates = useMemo(() => {
    if (!isNew || !form.isRecurring) return [];
    const endDate = form.recurringEndType === "custom" && form.recurringEndDate
      ? form.recurringEndDate
      : undefined;
    return buildRecurringDates(form.date, form.recurringFrequency, endDate);
  }, [isNew, form.isRecurring, form.date, form.recurringFrequency, form.recurringEndType, form.recurringEndDate]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/finances/transactions"] });
    qc.invalidateQueries({ queryKey: ["/api/finances/summary"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(form.amount.replace(/[^0-9.]/g, ""));
      if (!form.date || !form.description || isNaN(amt) || amt <= 0 || !form.category) {
        throw new Error("Please fill in date, description, amount, and category.");
      }
      const base = {
        description: form.description,
        amount: amt,
        type: form.type,
        category: form.category,
        propertyId: form.propertyId ? parseInt(form.propertyId) : null,
        vendorPayer: form.vendorPayer || null,
        paymentAccount: form.paymentAccount || null,
        rentalType: form.rentalType || null,
        notes: form.notes || null,
        isReviewed: form.isReviewed,
      };

      // Bulk create for recurring new transactions
      if (isNew && form.isRecurring && recurringDates.length > 1) {
        const items = recurringDates.map(d => ({ ...base, date: d }));
        const r = await fetch("/api/finances/transactions/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactions: items }),
        });
        if (!r.ok) throw new Error("Failed to create recurring transactions");
        return;
      }

      // Single transaction (new or edit)
      const url = tx ? `/api/finances/transactions/${tx.id}` : "/api/finances/transactions";
      const method = tx ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, date: form.date }),
      });
      if (!r.ok) throw new Error("Failed to save transaction");
    },
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e: Error) => setError(e.message),
  });

  const inp = "px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/30";
  const sel = inp;

  const saveLabel = (() => {
    if (save.isPending) return "Saving…";
    if (tx) return "Save Changes";
    if (form.isRecurring && recurringDates.length > 1) return `Create ${recurringDates.length} Transactions`;
    return "Add Transaction";
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">{tx ? "Edit Transaction" : "Add Transaction"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                {form.isRecurring && isNew ? "Start Date *" : "Date *"}
              </label>
              <input type="date" value={form.date} onChange={e => set("date", e.target.value)} className={inp} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input
                  type="text" inputMode="decimal"
                  value={form.amount}
                  onChange={e => set("amount", e.target.value)}
                  placeholder="0.00"
                  className={cn(inp, "pl-7")}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Description *</label>
            <input type="text" value={form.description} onChange={e => set("description", e.target.value)} placeholder="e.g. July rent from unit 2A" className={inp} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Type *</label>
              <select value={form.type} onChange={e => setType(e.target.value as TxType)} className={sel}>
                {TYPES.map(t => <option key={t} value={t}>{TX_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Category *</label>
              <select value={form.category} onChange={e => set("category", e.target.value)} className={sel}>
                <option value="">Select…</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Property</label>
              <select value={form.propertyId} onChange={e => set("propertyId", e.target.value)} className={sel}>
                <option value="">Unassigned</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Rental Type</label>
              <select value={form.rentalType} onChange={e => set("rentalType", e.target.value)} className={sel}>
                <option value="">Not specified</option>
                <option value="long_term">Long-Term Rental</option>
                <option value="short_term">Short-Term Rental</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Vendor / Payer</label>
              <input type="text" value={form.vendorPayer} onChange={e => set("vendorPayer", e.target.value)} placeholder="Name" className={inp} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Payment Account</label>
              <input type="text" value={form.paymentAccount} onChange={e => set("paymentAccount", e.target.value)} placeholder="e.g. Chase Checking" className={inp} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Notes</label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Optional notes" className={cn(inp, "resize-y")} />
          </div>

          {/* ── Recurring toggle (new transactions only) ─────────────────── */}
          {isNew && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div
                  onClick={() => set("isRecurring", !form.isRecurring)}
                  className={cn(
                    "w-9 h-5 rounded-full transition-colors relative shrink-0",
                    form.isRecurring ? "bg-primary" : "bg-border",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                      form.isRecurring ? "translate-x-4" : "translate-x-0",
                    )}
                  />
                </div>
                <Repeat className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Recurring payment</span>
              </label>

              {form.isRecurring && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Frequency</label>
                      <select
                        value={form.recurringFrequency}
                        onChange={e => set("recurringFrequency", e.target.value as RecurringFrequency)}
                        className={sel}
                      >
                        {(Object.entries(FREQ_LABELS) as [RecurringFrequency, string][]).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Repeat until</label>
                      <select
                        value={form.recurringEndType}
                        onChange={e => set("recurringEndType", e.target.value as "end_of_year" | "custom")}
                        className={sel}
                      >
                        <option value="end_of_year">End of year</option>
                        <option value="custom">Custom date</option>
                      </select>
                    </div>
                  </div>

                  {form.recurringEndType === "custom" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">End date</label>
                      <input
                        type="date"
                        value={form.recurringEndDate}
                        min={form.date}
                        onChange={e => set("recurringEndDate", e.target.value)}
                        className={inp}
                      />
                    </div>
                  )}

                  {recurringDates.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 border border-primary/15 rounded-md px-3 py-2">
                      <Repeat className="w-3 h-3 text-primary shrink-0" />
                      <span>
                        Will create{" "}
                        <span className="font-semibold text-foreground">{recurringDates.length} transaction{recurringDates.length !== 1 ? "s" : ""}</span>
                        {" "}· {fmtDateRange(recurringDates)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isReviewed} onChange={e => set("isReviewed", e.target.checked)} className="w-4 h-4 accent-primary" />
            <span className="text-sm text-foreground">Mark as reviewed</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function FinancesTransactions({ filterPropertyId, dateFrom, dateTo }: Props) {
  const qc = useQueryClient();
  const [editTx, setEditTx] = useState<Transaction | null | "new">(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [reviewFilter, setReviewFilter] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Use the authenticated api-client hook so the Bearer token is included
  const { data: properties = [] } = useListProperties();

  const params = new URLSearchParams();
  if (filterPropertyId) params.set("propertyId", filterPropertyId);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data: txs = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/finances/transactions", filterPropertyId, dateFrom, dateTo],
    queryFn: () => fetch(`/api/finances/transactions?${params.toString()}`).then(r => r.json()),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/finances/transactions/${id}`, { method: "DELETE" }).then(r => {
        if (!r.ok) throw new Error("Delete failed");
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/finances/transactions"] });
      qc.invalidateQueries({ queryKey: ["/api/finances/summary"] });
      setDeleteId(null);
    },
  });

  const toggleReview = useMutation({
    mutationFn: ({ id, isReviewed }: { id: number; isReviewed: boolean }) =>
      fetch(`/api/finances/transactions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isReviewed }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/finances/transactions"] });
      qc.invalidateQueries({ queryKey: ["/api/finances/summary"] });
    },
  });

  const propMap = new Map(properties.map(p => [p.id, p.name]));

  const filtered = txs.filter(tx => {
    if (typeFilter && tx.type !== typeFilter) return false;
    if (reviewFilter === "reviewed" && !tx.isReviewed) return false;
    if (reviewFilter === "unreviewed" && tx.isReviewed) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        tx.description.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q) ||
        (tx.vendorPayer ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totals = filtered.reduce(
    (acc, tx) => {
      if (tx.type === "income" || tx.type === "owner_contribution") acc.income += tx.amount;
      else acc.outflow += tx.amount;
      return acc;
    },
    { income: 0, outflow: 0 },
  );

  return (
    <>
      {/* Modals */}
      {editTx !== null && (
        <TransactionModal
          tx={editTx === "new" ? null : editTx}
          properties={properties}
          onClose={() => setEditTx(null)}
        />
      )}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-card rounded-xl border border-border shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-semibold text-foreground mb-2">Delete transaction?</h3>
            <p className="text-sm text-muted-foreground mb-5">This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors">Cancel</button>
              <button
                onClick={() => deleteMut.mutate(deleteId)}
                disabled={deleteMut.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search description, category, vendor…"
              className="pl-9 pr-4 py-2 border border-border rounded-lg bg-background text-foreground text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All types</option>
            {TYPES.map(t => <option key={t} value={t}>{TX_TYPE_LABELS[t]}</option>)}
          </select>
          <select
            value={reviewFilter}
            onChange={e => setReviewFilter(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All statuses</option>
            <option value="reviewed">Reviewed</option>
            <option value="unreviewed">Needs review</option>
          </select>
          <button
            onClick={() => setEditTx("new")}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Transaction
          </button>
        </div>

        {/* Totals bar */}
        {filtered.length > 0 && (
          <div className="flex flex-wrap gap-4 px-4 py-3 rounded-lg bg-muted/40 border border-border text-sm">
            <span className="text-muted-foreground">{filtered.length} transaction{filtered.length !== 1 ? "s" : ""}</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">{fmt$(totals.income)} in</span>
            <span className="text-red-600 dark:text-red-400 font-medium">{fmt$(totals.outflow)} out</span>
            <span className={cn("font-semibold", totals.income - totals.outflow >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
              {fmt$(totals.income - totals.outflow)} net
            </span>
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground text-sm">
            {txs.length === 0 ? (
              <>
                <p className="font-medium text-foreground mb-1">No transactions yet</p>
                <p>Click "Add Transaction" to record your first income or expense.</p>
              </>
            ) : (
              <p>No transactions match your filters.</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-8">✓</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Property</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(tx => {
                    const outflow = isOutflow(tx.type as TxType);
                    return (
                      <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleReview.mutate({ id: tx.id, isReviewed: !tx.isReviewed })}
                            title={tx.isReviewed ? "Mark unreviewed" : "Mark reviewed"}
                            className="text-muted-foreground hover:text-primary transition-colors"
                          >
                            {tx.isReviewed
                              ? <CheckCircle className="w-4 h-4 text-emerald-600" />
                              : <Circle className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{tx.date}</td>
                        <td className="px-4 py-3 text-foreground max-w-48 truncate" title={tx.description}>
                          {tx.description}
                          {tx.vendorPayer && (
                            <span className="block text-xs text-muted-foreground">{tx.vendorPayer}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", TYPE_COLORS[tx.type] ?? "bg-muted text-foreground")}>
                            {TX_TYPE_LABELS[tx.type as TxType] ?? tx.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{tx.category}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs truncate max-w-32">
                          {tx.propertyId ? (propMap.get(tx.propertyId) ?? "—") : "Unassigned"}
                        </td>
                        <td className={cn("px-4 py-3 text-right font-medium whitespace-nowrap", outflow ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400")}>
                          {outflow ? "−" : "+"}{fmt$(tx.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => setEditTx(tx)}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteId(tx.id)}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
