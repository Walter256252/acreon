import { useState } from "react";
import { Wallet, LayoutDashboard, List, FileBarChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useListProperties } from "@workspace/api-client-react";
import FinancesOverview from "./overview";
import FinancesTransactions from "./transactions";
import FinancesReport from "./report";
import AiQuickAdd, { type EmailSuggestionInput } from "./ai-quick-add";
import EmailSuggestions from "./email-suggestions";

// ── Types ─────────────────────────────────────────────────────────────────

type Tab = "overview" | "transactions" | "report";
interface Property { id: number; name: string; }

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview",     label: "Overview",     icon: LayoutDashboard },
  { id: "transactions", label: "Transactions",  icon: List },
  { id: "report",       label: "CPA Report",    icon: FileBarChart },
];

function currentYear() { return new Date().getFullYear(); }
function isoDate(d: Date) { return d.toISOString().split("T")[0]; }

// ── Filter bar ────────────────────────────────────────────────────────────

const RANGE_OPTIONS = [
  { value: "ytd",    label: "Year to date" },
  { value: "year",   label: "Full year" },
  { value: "custom", label: "Custom range" },
];

function rangeForOption(opt: string, year: number): { from: string; to: string } {
  const y = year;
  const now = new Date();
  switch (opt) {
    case "ytd":  return { from: `${y}-01-01`, to: isoDate(now) };
    case "year": return { from: `${y}-01-01`, to: `${y}-12-31` };
    default:     return { from: "", to: "" };
  }
}

function yearRange() {
  const y = currentYear();
  const top = Math.max(y + 1, 2027); // always include at least 2027
  return Array.from({ length: top - (y - 4) }, (_, i) => top - i);
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function Finances() {
  const [tab, setTab] = useState<Tab>("overview");

  // Global filters (passed down to sub-tabs)
  const [rangeOpt, setRangeOpt]     = useState("ytd");
  const [year, setYear]             = useState(currentYear());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");
  const [propFilter, setPropFilter] = useState("");

  // Email suggestion pre-fill state
  const [activeSuggestion, setActiveSuggestion] = useState<EmailSuggestionInput | null>(null);

  const derived = rangeOpt === "custom"
    ? { from: customFrom, to: customTo }
    : rangeForOption(rangeOpt, year);

  const { data: properties = [] } = useListProperties();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Wallet className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Finances</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Track income and expenses by property. Generate a clean yearly report for your CPA.
        </p>
      </div>

      {/* Email Finance Suggestions (only visible when email is connected) */}
      <EmailSuggestions
        onAddSuggestion={(s) => {
          setActiveSuggestion(s);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      {/* AI Quick Add */}
      <AiQuickAdd
        suggestion={activeSuggestion}
        onSuggestionConsumed={() => setActiveSuggestion(null)}
      />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-end p-4 rounded-xl border border-border bg-card">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Period</label>
          <select
            value={rangeOpt}
            onChange={e => setRangeOpt(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {rangeOpt !== "custom" && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Year</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {yearRange().map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}

        {rangeOpt === "custom" && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </>
        )}

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

      {/* Sub-navigation tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <FinancesOverview
          dateFrom={derived.from}
          dateTo={derived.to}
          propertyId={propFilter}
        />
      )}
      {tab === "transactions" && (
        <FinancesTransactions
          filterPropertyId={propFilter}
          dateFrom={derived.from}
          dateTo={derived.to}
        />
      )}
      {tab === "report" && (
        <FinancesReport />
      )}
    </div>
  );
}
