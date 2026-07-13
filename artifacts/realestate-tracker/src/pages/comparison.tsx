import { useState, useEffect } from "react";
import {
  Scale, DollarSign, Clock, Trophy, ChevronDown,
  CheckSquare, Square, Play, Loader2, Info, Sparkles, CalendarDays,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

type ScenarioMode = "monthly-for" | "lump-sum" | "ongoing";

interface Property {
  id: number;
  name: string;
  address: string;
  loanAmount: number;
  interestRate: number;
  loanTermYears: number;
  loanStartDate: string | null;
  monthlyPayment: number;
  currentValue: number;
  purchasePrice: number;
}

interface CalcSummary {
  monthsSaved: number;
  interestSaved: number;
  payoffDate: string;
  totalInterest: number;
  totalPayments: number;
}

interface PropertyResult {
  property: Property;
  summary: CalcSummary;
  capitalDeployed: number;
  status: "done" | "loading" | "error";
  errorMsg?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function monthsElapsed(loanStartDate: string | null): number {
  if (!loanStartDate) return 0;
  const start = new Date(loanStartDate);
  const now = new Date();
  return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth());
}

function buildExtraPayments(
  mode: ScenarioMode,
  amount: number,
  months: number,
  elapsed: number,
): { extraPaymentMonthly: number; extraPayments: { paymentNumber: number; amount: number }[] } {
  if (mode === "ongoing") {
    return { extraPaymentMonthly: amount, extraPayments: [] };
  }
  if (mode === "lump-sum") {
    return { extraPaymentMonthly: 0, extraPayments: [{ paymentNumber: elapsed + 1, amount }] };
  }
  // monthly-for
  const payments = Array.from({ length: months }, (_, i) => ({
    paymentNumber: elapsed + 1 + i,
    amount,
  }));
  return { extraPaymentMonthly: 0, extraPayments: payments };
}

function capitalDeployed(mode: ScenarioMode, amount: number, months: number, remainingMonths: number): number {
  if (mode === "ongoing") return amount * remainingMonths;
  if (mode === "lump-sum") return amount;
  return amount * months;
}

// ── Scenario mode toggle ───────────────────────────────────────────────────

const MODES: { value: ScenarioMode; label: string; desc: string }[] = [
  { value: "monthly-for", label: "Monthly for a period", desc: "Extra each month for a fixed number of months" },
  { value: "lump-sum",    label: "One-time lump sum",   desc: "A single extra payment applied right now" },
  { value: "ongoing",     label: "Ongoing monthly",      desc: "Add this amount to every remaining payment" },
];

// ── Result card ────────────────────────────────────────────────────────────

function ResultCard({
  result,
  rank,
  best,
}: {
  result: PropertyResult;
  rank: number;
  best: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { property: p, summary: s, capitalDeployed: cap } = result;

  const roi = cap > 0 ? (s.interestSaved / cap) * 100 : 0;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card overflow-hidden transition-shadow",
        best ? "border-primary shadow-md shadow-primary/10" : "border-border",
      )}
    >
      {/* Card header */}
      <div className={cn("px-5 py-4 flex items-start justify-between gap-3", best && "bg-primary/5")}>
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5",
            best ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}>
            {rank}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-foreground">{p.name}</p>
              {best && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                  <Trophy className="w-3 h-3" /> Best ROI
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.address}</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">{p.interestRate}% rate</p>
          </div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-1"
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {/* Key metrics row */}
      <div className="px-5 py-4 grid grid-cols-3 gap-4 border-t border-border">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Interest saved</p>
          <p className={cn("text-lg font-bold", best ? "text-primary" : "text-foreground")}>
            {fmt$(s.interestSaved)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Months cut</p>
          <p className="text-lg font-bold text-foreground">
            {s.monthsSaved > 0 ? `${s.monthsSaved} mo` : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Return on cash</p>
          <p className="text-lg font-bold text-foreground">
            {roi.toFixed(0)}%
          </p>
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="px-5 py-4 border-t border-border space-y-3 bg-muted/20">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">New payoff date</span>
                <span className="font-medium text-foreground">{fmtDate(s.payoffDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total interest (scenario)</span>
                <span className="font-medium text-foreground">{fmt$(s.totalInterest)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Capital deployed</span>
                <span className="font-medium text-foreground">{fmt$(cap)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Loan balance</span>
                <span className="font-medium text-foreground">{fmt$(p.loanAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function Comparison() {
  // Scenario state
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<ScenarioMode>("monthly-for");
  const [months, setMonths] = useState("");

  // Optional end-date for "monthly-for" mode
  const [endMonth, setEndMonth] = useState(""); // "1"–"12"
  const [endYear, setEndYear] = useState("");   // e.g. "2027"

  // When end month+year are both set, auto-compute months from today
  useEffect(() => {
    if (!endMonth || !endYear) return;
    const m = parseInt(endMonth);
    const y = parseInt(endYear);
    if (!m || !y || y < 2000 || y > 2100) return;
    const now = new Date();
    const computed =
      (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
    if (computed > 0) setMonths(String(computed));
  }, [endMonth, endYear]);

  // Property selection
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Results
  const [results, setResults] = useState<PropertyResult[]>([]);
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  // Load properties
  const { data: properties = [], isLoading: propsLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    queryFn: () => fetch("/api/properties").then((r) => r.json()),
  });

  const allSelected = properties.length > 0 && selected.size === properties.length;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(properties.map((p) => p.id)));
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const amountNum = parseFloat(amount.replace(/[^0-9.]/g, "")) || 0;
  const monthsNum = parseInt(months) || 0;
  const selectedProps = properties.filter((p) => selected.has(p.id));

  const canRun =
    amountNum > 0 &&
    selectedProps.length > 0 &&
    (mode !== "monthly-for" || monthsNum > 0);

  const handleRun = async () => {
    if (!canRun) return;
    setRunning(true);
    setHasRun(true);
    setResults(
      selectedProps.map((p) => ({
        property: p,
        summary: { monthsSaved: 0, interestSaved: 0, payoffDate: "", totalInterest: 0, totalPayments: 0 },
        capitalDeployed: 0,
        status: "loading",
      })),
    );

    const settled = await Promise.all(
      selectedProps.map(async (p): Promise<PropertyResult> => {
        const elapsed = monthsElapsed(p.loanStartDate);
        const { extraPaymentMonthly, extraPayments } = buildExtraPayments(mode, amountNum, monthsNum, elapsed);

        // Remaining months for "ongoing" capital estimate
        const totalMonths = p.loanTermYears * 12;
        const remaining = Math.max(1, totalMonths - elapsed);
        const cap = capitalDeployed(mode, amountNum, monthsNum, remaining);

        try {
          const resp = await fetch("/api/calculator", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              loanAmount: p.loanAmount,
              interestRate: p.interestRate,
              loanTermYears: p.loanTermYears,
              loanStartDate: p.loanStartDate ?? new Date().toISOString().slice(0, 10),
              monthlyPayment: p.monthlyPayment,
              extraPaymentMonthly,
              extraPayments,
            }),
          });

          if (!resp.ok) throw new Error("Calculator error");
          const data = await resp.json();

          return {
            property: p,
            summary: data.summary as CalcSummary,
            capitalDeployed: cap,
            status: "done",
          };
        } catch {
          return {
            property: p,
            summary: { monthsSaved: 0, interestSaved: 0, payoffDate: "", totalInterest: 0, totalPayments: 0 },
            capitalDeployed: cap,
            status: "error",
            errorMsg: "Could not calculate — check loan details for this property.",
          };
        }
      }),
    );

    setResults(settled.sort((a, b) => b.summary.interestSaved - a.summary.interestSaved));
    setRunning(false);
  };

  // Best result = highest interest saved
  const bestId = results.find((r) => r.status === "done")?.property.id;

  // Scenario description for the recommendation
  const scenarioLabel =
    mode === "monthly-for" ? `${fmt$(amountNum)}/mo for ${monthsNum} months`
    : mode === "lump-sum" ? `${fmt$(amountNum)} lump sum`
    : `${fmt$(amountNum)}/mo ongoing`;

  const bestResult = results.find((r) => r.status === "done" && r.property.id === bestId);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Scale className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Smart Comparison</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Enter a scenario once and see the impact across all your properties side by side — so you can put your money where it does the most work.
        </p>
      </div>

      {/* Scenario config */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <h2 className="font-semibold text-foreground">Configure your scenario</h2>

        {/* Mode */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">Payment type</label>
          <div className="grid sm:grid-cols-3 gap-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={cn(
                  "text-left p-3 rounded-lg border text-sm transition-colors",
                  mode === m.value
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                <p className="font-medium">{m.label}</p>
                <p className="text-xs mt-0.5 text-muted-foreground">{m.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Amount + duration */}
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {mode === "lump-sum" ? "One-time amount" : "Extra amount per month"}
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount"
                className="pl-9 pr-4 py-2 border border-border rounded-lg bg-background text-foreground text-sm w-40 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {mode === "monthly-for" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">For how many months</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  inputMode="numeric"
                  value={months}
                  onChange={(e) => {
                    setMonths(e.target.value);
                    // Clear end-date when typing months directly
                    setEndMonth("");
                    setEndYear("");
                  }}
                  placeholder="# months"
                  className="pl-9 pr-4 py-2 border border-border rounded-lg bg-background text-foreground text-sm w-36 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">mo</span>
              </div>
            </div>
          )}

          {/* Summary pill */}
          {amountNum > 0 && monthsNum > 0 && (
            <div className="flex items-end">
              <div className="flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium px-3 py-2 rounded-lg">
                <Sparkles className="w-3.5 h-3.5" />
                {mode === "monthly-for" && `${fmt$(amountNum)}/mo × ${monthsNum} mo = ${fmt$(amountNum * monthsNum)} total`}
                {mode === "lump-sum" && `${fmt$(amountNum)} paid once now`}
                {mode === "ongoing" && `${fmt$(amountNum)} added to every payment`}
              </div>
            </div>
          )}
          {amountNum > 0 && mode !== "monthly-for" && monthsNum === 0 && (
            <div className="flex items-end">
              <div className="flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium px-3 py-2 rounded-lg">
                <Sparkles className="w-3.5 h-3.5" />
                {mode === "lump-sum" && `${fmt$(amountNum)} paid once now`}
                {mode === "ongoing" && `${fmt$(amountNum)} added to every payment`}
              </div>
            </div>
          )}
        </div>

        {/* Optional end-date for monthly-for */}
        {mode === "monthly-for" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
              <label className="text-xs font-medium text-muted-foreground">
                Or pick an end month & year <span className="font-normal">(optional — auto-fills months above)</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <select
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Month</option>
                {["January","February","March","April","May","June","July","August","September","October","November","December"].map((name, i) => (
                  <option key={i + 1} value={String(i + 1)}>{name}</option>
                ))}
              </select>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={endYear}
                onChange={(e) => setEndYear(e.target.value)}
                placeholder="Year"
                className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm w-24 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {(endMonth || endYear) && (
                <button
                  type="button"
                  onClick={() => { setEndMonth(""); setEndYear(""); setMonths(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Property selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Select properties to compare</h2>
          {properties.length > 0 && (
            <button
              onClick={toggleAll}
              className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
            >
              {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>

        {propsLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : properties.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
            No properties yet. Add a property first.
          </div>
        ) : (
          <div className="space-y-2">
            {properties.map((p) => {
              const isSelected = selected.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleOne(p.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                    isSelected ? "border-primary bg-primary" : "border-muted-foreground/40",
                  )}>
                    {isSelected && <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-white fill-none stroke-current stroke-[2]"><polyline points="1.5,5 4,8 8.5,2" /></svg>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.address}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-foreground">{p.interestRate}%</p>
                    <p className="text-xs text-muted-foreground">rate</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={!canRun || running}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors",
          canRun && !running
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-muted text-muted-foreground cursor-not-allowed",
        )}
      >
        {running ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Running comparison…</>
        ) : (
          <><Play className="w-4 h-4" /> Run Comparison</>
        )}
      </button>

      {/* Results */}
      {hasRun && results.length > 0 && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Results — ranked by interest saved</h2>
            <span className="text-xs text-muted-foreground">{results.length} propert{results.length !== 1 ? "ies" : "y"}</span>
          </div>

          {running ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {results.map((r, i) =>
                  r.status === "error" ? (
                    <div key={r.property.id} className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      <span className="font-medium">{r.property.name}</span> — {r.errorMsg}
                    </div>
                  ) : (
                    <ResultCard
                      key={r.property.id}
                      result={r}
                      rank={i + 1}
                      best={r.property.id === bestId}
                    />
                  )
                )}
              </div>

              {/* Smart recommendation */}
              {bestResult && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 flex items-start gap-3">
                  <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground leading-relaxed">
                    <span className="font-semibold">Smart pick: {bestResult.property.name}.</span>{" "}
                    Applying {scenarioLabel} here saves you{" "}
                    <span className="font-semibold text-primary">{fmt$(bestResult.summary.interestSaved)}</span> in interest
                    {bestResult.summary.monthsSaved > 0 && (
                      <> and cuts <span className="font-semibold">{bestResult.summary.monthsSaved} months</span> off the loan</>
                    )}
                    {results.length > 1 && ` — more than any other property`}
                    {bestResult.property.interestRate === Math.max(...results.map((r) => r.property.interestRate)) && (
                      <>, because it carries your highest interest rate ({bestResult.property.interestRate}%)</>
                    )}.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
