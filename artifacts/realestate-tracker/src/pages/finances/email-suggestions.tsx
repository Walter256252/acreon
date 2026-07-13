import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Sparkles, X, ChevronDown, ChevronUp, Loader2, ArrowRight, RefreshCw, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { useListProperties } from "@workspace/api-client-react";
import { TX_TYPE_LABELS, type TxType } from "./categories";

// ── Types ─────────────────────────────────────────────────────────────────

interface EmailSuggestion {
  id: number;
  emailNoteId: number;
  emailSubject: string;
  emailSummary: string;
  emailDate: string;
  propertyId: number | null;
  suggestedDate: string;
  suggestedDescription: string;
  suggestedAmount: number | null;
  suggestedType: string;
  suggestedCategory: string;
  suggestedVendor: string | null;
  createdAt: string;
}

interface EmailSuggestionsProps {
  /** Called when user clicks "Add to Finances" — pre-fills the AI Quick Add review card */
  onAddSuggestion: (s: EmailSuggestion) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const TYPE_COLORS: Record<string, string> = {
  income: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  expense: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  loan_payment: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  capital_improvement: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
  owner_contribution: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  owner_draw: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
};

// ── Component ─────────────────────────────────────────────────────────────

export default function EmailSuggestions({ onAddSuggestion }: EmailSuggestionsProps) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const { data: properties = [] } = useListProperties();
  const propMap = new Map(properties.map((p) => [p.id, p.name]));

  // Check email connection
  const { data: emailStatus } = useQuery<{ connected: boolean; email: string | null }>({
    queryKey: ["/api/email/status"],
    queryFn: () => fetch("/api/email/status").then((r) => r.json()),
  });

  // Fetch pending suggestions
  const { data: suggestions = [], isLoading } = useQuery<EmailSuggestion[]>({
    queryKey: ["/api/finances/email-suggestions"],
    queryFn: () => fetch("/api/finances/email-suggestions").then((r) => r.json()),
    enabled: !!emailStatus?.connected,
  });

  // Scan mutation
  const scanMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/finances/email-suggestions/scan", { method: "POST" });
      if (!r.ok) throw new Error("Scan failed");
      return r.json() as Promise<{ scanned: number; found: number }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/finances/email-suggestions"] });
    },
  });

  // Dismiss mutation
  const dismissMut = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/finances/email-suggestions/${id}/dismiss`, { method: "PATCH" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/finances/email-suggestions"] });
    },
  });

  // Don't render at all if no email connected
  if (!emailStatus?.connected) return null;

  const hasSuggestions = suggestions.length > 0;

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/20 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-blue-100/50 dark:hover:bg-blue-950/30 transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
          <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Finance Suggestions from Email</p>
            {hasSuggestions && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500 text-white font-semibold">
                {suggestions.length}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {emailStatus.email
              ? `Scanning ${emailStatus.email} for transactions to log`
              : "Scanning your inbox for transactions to log"}
          </p>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3">
          {/* Scan row */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {hasSuggestions
                ? `${suggestions.length} email${suggestions.length !== 1 ? "s" : ""} look like they may need a transaction logged.`
                : isLoading
                ? "Loading suggestions…"
                : "No pending suggestions. Scan your inbox to find recent finance-related emails."}
            </p>
            <button
              onClick={() => scanMut.mutate()}
              disabled={scanMut.isPending}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ml-3",
                "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50",
              )}
            >
              {scanMut.isPending
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Scanning…</>
                : <><RefreshCw className="w-3 h-3" /> Scan emails</>}
            </button>
          </div>

          {/* Scan result */}
          {scanMut.isSuccess && (
            <p className="text-xs text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-950/40 rounded-md px-3 py-2">
              {scanMut.data.found > 0
                ? `Found ${scanMut.data.found} new suggestion${scanMut.data.found !== 1 ? "s" : ""} from ${scanMut.data.scanned} email${scanMut.data.scanned !== 1 ? "s" : ""}.`
                : `Scanned ${scanMut.data.scanned} email${scanMut.data.scanned !== 1 ? "s" : ""} — no new finance-related content found.`}
            </p>
          )}
          {scanMut.isError && (
            <p className="text-xs text-destructive">Scan failed — please try again.</p>
          )}

          {/* Suggestion cards */}
          {hasSuggestions && (
            <div className="space-y-2">
              {suggestions.map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  propName={s.propertyId ? propMap.get(s.propertyId) ?? null : null}
                  onAdd={() => onAddSuggestion(s)}
                  onDismiss={() => dismissMut.mutate(s.id)}
                  dismissing={dismissMut.isPending}
                />
              ))}
            </div>
          )}

          {!hasSuggestions && !isLoading && !scanMut.isPending && (
            <div className="flex items-center gap-2.5 rounded-lg bg-background border border-border px-4 py-3">
              <Inbox className="w-4 h-4 text-muted-foreground/50 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Click <span className="font-medium text-foreground">Scan emails</span> to check your last 90 days of property emails for transactions you may have missed.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Suggestion Card ───────────────────────────────────────────────────────

function SuggestionCard({
  suggestion: s,
  propName,
  onAdd,
  onDismiss,
  dismissing,
}: {
  suggestion: EmailSuggestion;
  propName: string | null;
  onAdd: () => void;
  onDismiss: () => void;
  dismissing: boolean;
}) {
  const [showSummary, setShowSummary] = useState(false);
  const typeColor = TYPE_COLORS[s.suggestedType] ?? "bg-muted text-muted-foreground";
  const typeLabel = TX_TYPE_LABELS[s.suggestedType as TxType] ?? s.suggestedType;

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Icon */}
        <div className="w-7 h-7 rounded-md bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Email source */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground truncate max-w-xs" title={s.emailSubject}>
              <Mail className="w-2.5 h-2.5 inline mr-1 opacity-60" />
              {s.emailSubject}
            </span>
            <span className="text-xs text-muted-foreground/60">·</span>
            <span className="text-xs text-muted-foreground/60">{fmtDate(s.emailDate)}</span>
          </div>

          {/* Suggested transaction */}
          <p className="text-sm font-medium text-foreground">{s.suggestedDescription}</p>

          {/* Tags */}
          <div className="flex items-center gap-2 flex-wrap">
            {s.suggestedAmount != null && (
              <span className="text-sm font-bold text-foreground">{fmt$(s.suggestedAmount)}</span>
            )}
            {s.suggestedAmount == null && (
              <span className="text-xs text-muted-foreground italic">Amount not found in email</span>
            )}
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", typeColor)}>
              {typeLabel}
            </span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {s.suggestedCategory}
            </span>
            {propName && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {propName}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {fmtDate(s.suggestedDate)}
            </span>
          </div>

          {/* Email summary toggle */}
          <button
            onClick={() => setShowSummary((v) => !v)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showSummary ? "Hide email summary" : "Show email summary"}
          </button>
          {showSummary && (
            <p className="text-xs text-muted-foreground leading-relaxed bg-muted/40 rounded-md px-3 py-2 border border-border">
              {s.emailSummary}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onDismiss}
            disabled={dismissing}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onAdd}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            title="Add to Finances"
          >
            Add
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
