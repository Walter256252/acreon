import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Send, Check, X, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useListProperties } from "@workspace/api-client-react";
import { TX_TYPE_LABELS, categoriesForType, type TxType } from "./categories";

// ── Types ─────────────────────────────────────────────────────────────────

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number | null;
  type: TxType;
  category: string;
  propertyId: number | null;
  propertyName: string | null;
  vendorPayer: string | null;
  rentalType: string | null;
  notes: string | null;
  confidence: "high" | "medium" | "low";
  clarification: string | null;
}

// ── Helpers ───────────────────────────────────────────────name──────────────

const TYPES: TxType[] = [
  "income", "expense", "loan_payment", "owner_contribution", "owner_draw", "capital_improvement",
];

function today() {
  return new Date().toISOString().split("T")[0];
}

// ── Review Card ───────────────────────────────────────────────────────────

function ReviewField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function inp(extra = "") {
  return cn(
    "px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/30",
    extra,
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function AiQuickAdd() {
  const qc = useQueryClient();
  const { data: properties = [] } = useListProperties();

  const [expanded, setExpanded] = useState(true);
  const [input, setInput] = useState("");
  const [parsed, setParsed] = useState<ParsedTransaction | null>(null);

  // Editable review state (mirrors ParsedTransaction fields)
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TxType>("income");
  const [category, setCategory] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [vendorPayer, setVendorPayer] = useState("");
  const [rentalType, setRentalType] = useState("");
  const [notes, setNotes] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keep category in sync when type changes (reset if no longer valid)
  const availableCategories = categoriesForType(type);

  // Parse mutation
  const parseMut = useMutation({
    mutationFn: async (text: string) => {
      const propList = properties.map((p) => ({ id: p.id, name: p.name }));
      const r = await fetch("/api/finances/ai-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, properties: propList }),
      });
      if (!r.ok) throw new Error("Failed to parse transaction");
      return r.json() as Promise<ParsedTransaction>;
    },
    onSuccess: (data) => {
      setParsed(data);
      setDate(data.date || today());
      setDescription(data.description || "");
      setAmount(data.amount != null ? String(data.amount) : "");
      setType(data.type || "income");
      setCategory(data.category || "");
      setPropertyId(data.propertyId != null ? String(data.propertyId) : "");
      setVendorPayer(data.vendorPayer || "");
      setRentalType(data.rentalType || "");
      setNotes(data.notes || "");
    },
  });

  // Save mutation
  const saveMut = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount.replace(/[^0-9.]/g, ""));
      if (!date || !description || isNaN(amt) || amt <= 0 || !category) {
        throw new Error("Fill in date, description, amount, and category before saving.");
      }
      const r = await fetch("/api/finances/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          description,
          amount: amt,
          type,
          category,
          propertyId: propertyId ? parseInt(propertyId) : null,
          vendorPayer: vendorPayer || null,
          rentalType: rentalType || null,
          notes: notes || null,
          isReviewed: true,
        }),
      });
      if (!r.ok) throw new Error("Failed to save transaction");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/finances/transactions"] });
      qc.invalidateQueries({ queryKey: ["/api/finances/summary"] });
      // Reset
      setInput("");
      setParsed(null);
      setDate(today());
      setDescription("");
      setAmount("");
      setType("income");
      setCategory("");
      setPropertyId("");
      setVendorPayer("");
      setRentalType("");
      setNotes("");
      parseMut.reset();
    },
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !parseMut.isPending) {
        parseMut.mutate(input.trim());
      }
    }
  };

  const dismiss = () => {
    setParsed(null);
    setInput("");
    parseMut.reset();
    saveMut.reset();
  };

  const EXAMPLES = [
    "July rent from unit 2A, $1,500",
    "Paid plumber $350 for Oak Street property",
    "Mortgage payment $2,100 — $1,800 principal, $300 interest",
    "Airbnb payout $890, short-term rental",
  ];

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-violet-500/5 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-primary/5 transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">AI Quick Add</p>
          <p className="text-xs text-muted-foreground">Describe a transaction in plain English — AI will file it for you</p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          {/* Input area */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder={`e.g. "${EXAMPLES[Math.floor(Date.now() / 10000) % EXAMPLES.length]}"`}
              disabled={parseMut.isPending}
              className={cn(
                "w-full resize-none px-4 py-3 pr-12 rounded-lg border border-border bg-background text-foreground text-sm",
                "placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            />
            <button
              onClick={() => input.trim() && !parseMut.isPending && parseMut.mutate(input.trim())}
              disabled={!input.trim() || parseMut.isPending}
              className="absolute right-3 bottom-3 w-7 h-7 flex items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
              title="Parse transaction (or press Enter)"
            >
              {parseMut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Error */}
          {parseMut.isError && (
            <p className="text-sm text-destructive">
              Couldn't parse that — try rephrasing with an amount and type.
            </p>
          )}
          {saveMut.isError && (
            <p className="text-sm text-destructive">
              {saveMut.error instanceof Error ? saveMut.error.message : "Save failed."}
            </p>
          )}

          {/* Review card */}
          {parsed && (
            <div className="rounded-xl border border-border bg-card shadow-sm">
              {/* Confidence banner */}
              <div
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-xs border-b border-border rounded-t-xl",
                  parsed.confidence === "high"
                    ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                    : parsed.confidence === "medium"
                    ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
                    : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400",
                )}
              >
                <Sparkles className="w-3 h-3 shrink-0" />
                <span className="font-medium">
                  {parsed.confidence === "high"
                    ? "Looks good — review and save"
                    : parsed.confidence === "medium"
                    ? "Review carefully before saving"
                    : "Low confidence — please fill in missing fields"}
                </span>
                {parsed.clarification && (
                  <span className="ml-1 opacity-80">· {parsed.clarification}</span>
                )}
              </div>

              <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Date */}
                <ReviewField label="Date *">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={inp()}
                  />
                </ReviewField>

                {/* Amount */}
                <ReviewField label="Amount *">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className={inp("pl-7")}
                    />
                  </div>
                </ReviewField>

                {/* Type */}
                <ReviewField label="Type *">
                  <select
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value as TxType);
                      setCategory("");
                    }}
                    className={inp()}
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>{TX_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </ReviewField>

                {/* Category */}
                <ReviewField label="Category *">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={inp()}
                  >
                    <option value="">Select…</option>
                    {availableCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </ReviewField>

                {/* Property */}
                <ReviewField label="Property">
                  <select
                    value={propertyId}
                    onChange={(e) => setPropertyId(e.target.value)}
                    className={inp()}
                  >
                    <option value="">Unassigned</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </ReviewField>

                {/* Rental Type */}
                <ReviewField label="Rental Type">
                  <select
                    value={rentalType}
                    onChange={(e) => setRentalType(e.target.value)}
                    className={inp()}
                  >
                    <option value="">Not specified</option>
                    <option value="long_term">Long-Term Rental</option>
                    <option value="short_term">Short-Term Rental</option>
                  </select>
                </ReviewField>

                {/* Description */}
                <div className="col-span-2 md:col-span-2 space-y-1">
                  <ReviewField label="Description *">
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className={inp()}
                    />
                  </ReviewField>
                </div>

                {/* Vendor / Payer */}
                <ReviewField label="Vendor / Payer">
                  <input
                    type="text"
                    value={vendorPayer}
                    onChange={(e) => setVendorPayer(e.target.value)}
                    placeholder="Name"
                    className={inp()}
                  />
                </ReviewField>

                {/* Notes */}
                {notes && (
                  <div className="col-span-2 md:col-span-3 space-y-1">
                    <ReviewField label="Notes">
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className={inp()}
                      />
                    </ReviewField>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 px-4 pb-4">
                <button
                  onClick={dismiss}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Discard
                </button>
                <button
                  onClick={() => saveMut.mutate()}
                  disabled={saveMut.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {saveMut.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {saveMut.isPending ? "Saving…" : "Save Transaction"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
