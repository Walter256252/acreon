import { useState } from "react";
import { Link, useParams } from "wouter";
import {
  ArrowLeft, RefreshCw, Mail, Users, Calendar, Lightbulb, ChevronDown, ChevronUp,
  Inbox, Loader2, Wrench, FileText, DollarSign, Search, Scale, Sparkles,
} from "lucide-react";
import {
  useGetProperty, useGetEmailNotesPropertyId, usePostEmailSyncPropertyId, useGetEmailStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

type GroupMode = "monthly" | "yearly" | "all" | "topic";

interface Note {
  id: number;
  subject: string;
  participants: string[];
  aiSummary: string;
  actionItems: string[];
  keyDates: { date: string; description: string }[];
  threadDate: string;
}

// ── Topic detection ────────────────────────────────────────────────────────

const TOPIC_KEYWORDS: [string, string, string][] = [
  // [topic label, icon key, keywords]
  ["Maintenance & Repairs", "wrench",    "repair|fix|leak|plumb|hvac|heat|cool|roof|paint|replace|broken|damage|water heater|appliance|electric|pest"],
  ["Lease & Tenants",       "file",      "lease|rent|tenant|renew|notice|vacate|move|occupan|agree|sign|term|deposit"],
  ["Payments & Finances",   "dollar",    "payment|paid|invoice|bill|charge|fee|insurance|tax|expense|receiv|transfer|wire|ach"],
  ["Inspections",           "search",    "inspect|walk.through|assessment|survey|evaluat|report|condition|review"],
  ["Legal & HOA",           "scale",     "legal|hoa|violation|notice|attorney|court|lien|evict|complian|regul|permit|zoning"],
];

function detectTopic(note: Note): string {
  const haystack = `${note.subject} ${note.aiSummary} ${note.actionItems.join(" ")}`.toLowerCase();
  for (const [label, , kw] of TOPIC_KEYWORDS) {
    if (new RegExp(kw).test(haystack)) return label;
  }
  return "General";
}

const TOPIC_ICON: Record<string, React.ReactNode> = {
  "Maintenance & Repairs": <Wrench className="w-4 h-4" />,
  "Lease & Tenants":       <FileText className="w-4 h-4" />,
  "Payments & Finances":   <DollarSign className="w-4 h-4" />,
  "Inspections":           <Search className="w-4 h-4" />,
  "Legal & HOA":           <Scale className="w-4 h-4" />,
  "General":               <Mail className="w-4 h-4" />,
};

const TOPIC_COLOR: Record<string, string> = {
  "Maintenance & Repairs": "bg-orange-100 text-orange-700 border-orange-200",
  "Lease & Tenants":       "bg-blue-100 text-blue-700 border-blue-200",
  "Payments & Finances":   "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Inspections":           "bg-violet-100 text-violet-700 border-violet-200",
  "Legal & HOA":           "bg-red-100 text-red-700 border-red-200",
  "General":               "bg-muted text-muted-foreground border-border",
};

// ── Example / preview data ─────────────────────────────────────────────────

const EXAMPLE_NOTES: Note[] = [
  {
    id: -1,
    subject: "Water heater replacement quote — approval needed",
    participants: ["tenant@example.com", "plumber@quickfix.com"],
    threadDate: "2025-06-12",
    aiSummary: "Tenant reported the water heater stopped working. Two plumbers were contacted; QuickFix Plumbing quoted $1,250 for a 50-gal unit with installation. Tenant requests expedited repair before weekend.",
    actionItems: ["Approve QuickFix Plumbing quote for $1,250", "Schedule installation before Friday June 14", "Keep receipt for insurance reimbursement"],
    keyDates: [{ date: "Jun 14, 2025", description: "Scheduled installation window" }],
  },
  {
    id: -2,
    subject: "Lease renewal — counter-offer from Mike Johnson",
    participants: ["mike.johnson@email.com"],
    threadDate: "2025-05-03",
    aiSummary: "Tenant Mike Johnson agreed to a 12-month renewal but countered the proposed 5% rent increase with 3%. He cited strong payment history and plans for minor cosmetic improvements at his own expense.",
    actionItems: ["Decide on final rent increase percentage", "Send updated lease agreement", "Confirm move-in date for any new clauses"],
    keyDates: [{ date: "Jul 1, 2025", description: "New lease start date" }, { date: "Jun 15, 2025", description: "Counter-offer response deadline" }],
  },
  {
    id: -3,
    subject: "April rent received — ACH confirmation",
    participants: ["noreply@rentpayments.com"],
    threadDate: "2025-04-02",
    aiSummary: "ACH transfer of $2,400 received for April rent. Transaction ID RT-2025-04-8821. No late fee applied. YTD payments on time.",
    actionItems: [],
    keyDates: [{ date: "Apr 2, 2025", description: "Payment cleared" }],
  },
  {
    id: -4,
    subject: "Annual property inspection — scheduled for March 20",
    participants: ["inspector@homeguard.com"],
    threadDate: "2025-03-08",
    aiSummary: "HomeGuard Inspections confirmed the annual walkthrough for March 20 at 10am. Tenant has been notified. Prior report noted minor caulking needed around master bath; inspector will re-check.",
    actionItems: ["Confirm tenant availability for March 20", "Repair master bath caulking before inspection", "Request copy of report within 5 days"],
    keyDates: [{ date: "Mar 20, 2025", description: "Annual inspection at 10am" }],
  },
  {
    id: -5,
    subject: "HOA assessment — special levy $450",
    participants: ["hoa@ridgeviewhoa.org"],
    threadDate: "2025-02-18",
    aiSummary: "Ridgeview HOA issued a special assessment of $450 to fund parking lot resurfacing. Payment due by March 31, 2025. Late fee of $50 applies after that date.",
    actionItems: ["Pay HOA special assessment of $450 by Mar 31", "Record as deductible expense"],
    keyDates: [{ date: "Mar 31, 2025", description: "HOA assessment due" }],
  },
  {
    id: -6,
    subject: "HVAC seasonal service — completed",
    participants: ["service@coolairpro.com"],
    threadDate: "2025-01-15",
    aiSummary: "Cool Air Pro completed the annual HVAC service. Technician replaced the air filter, cleaned coils, and topped off refrigerant. System is in good condition. Next recommended service: July 2025.",
    actionItems: ["Book next HVAC service for July 2025", "File service invoice for tax records"],
    keyDates: [{ date: "Jul 2025", description: "Next recommended HVAC service" }],
  },
];

// ── Grouping helpers ───────────────────────────────────────────────────────

function groupNotes(notes: Note[], mode: GroupMode): { label: string; icon?: React.ReactNode; notes: Note[] }[] {
  if (mode === "all") {
    return [{ label: "All Communications", notes: [...notes].sort((a, b) => b.threadDate.localeCompare(a.threadDate)) }];
  }
  if (mode === "topic") {
    const map = new Map<string, Note[]>();
    for (const n of notes) {
      const t = detectTopic(n);
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(n);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([label, ns]) => ({ label, icon: TOPIC_ICON[label], notes: ns.sort((a, b) => b.threadDate.localeCompare(a.threadDate)) }));
  }
  if (mode === "yearly") {
    const map = new Map<string, Note[]>();
    for (const n of notes) {
      const yr = n.threadDate.slice(0, 4);
      if (!map.has(yr)) map.set(yr, []);
      map.get(yr)!.push(n);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([yr, ns]) => ({ label: yr, notes: ns.sort((a, b) => b.threadDate.localeCompare(a.threadDate)) }));
  }
  // monthly (default)
  const map = new Map<string, Note[]>();
  for (const n of notes) {
    const key = n.threadDate.slice(0, 7); // "YYYY-MM"
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(n);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, ns]) => {
      const [yr, mo] = key.split("-");
      const label = new Date(Number(yr), Number(mo) - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
      return { label, notes: ns.sort((a, b) => b.threadDate.localeCompare(a.threadDate)) };
    });
}

// ── NoteCard ───────────────────────────────────────────────────────────────

function NoteCard({ note, isExample }: { note: Note; isExample?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const topic = detectTopic(note);

  return (
    <div className={cn("rounded-lg border bg-background overflow-hidden", isExample ? "border-dashed border-border/60" : "border-border")}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Mail className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-foreground text-sm truncate">{note.subject}</p>
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0", TOPIC_COLOR[topic])}>
              {TOPIC_ICON[topic]}
              {topic}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(note.threadDate).toLocaleDateString("default", { weekday: "short", month: "short", day: "numeric" })}
            {note.participants.length > 0 && (
              <span className="ml-2 text-muted-foreground/70">
                · {note.participants.slice(0, 2).join(", ")}{note.participants.length > 2 ? ` +${note.participants.length - 2}` : ""}
              </span>
            )}
          </p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-border space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">AI Summary</p>
            <p className="text-sm text-foreground leading-relaxed">{note.aiSummary}</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {note.actionItems.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action Items</p>
                </div>
                <ul className="space-y-1">
                  {note.actionItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {note.keyDates.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Key Dates</p>
                </div>
                <ul className="space-y-1">
                  {note.keyDates.map((kd, i) => (
                    <li key={i} className="text-sm text-foreground">
                      <span className="font-medium">{kd.date}</span>
                      {kd.description && <span className="text-muted-foreground ml-1">— {kd.description}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {note.participants.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Participants</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {note.participants.map((p, i) => (
                  <span key={i} className="text-xs bg-muted text-foreground px-2 py-0.5 rounded-full">{p}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Group view toggles ─────────────────────────────────────────────────────

const GROUP_MODES: { value: GroupMode; label: string }[] = [
  { value: "monthly",  label: "Monthly" },
  { value: "yearly",   label: "Yearly" },
  { value: "all",      label: "All" },
  { value: "topic",    label: "By Topic" },
];

function GroupToggles({ value, onChange }: { value: GroupMode; onChange: (v: GroupMode) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {GROUP_MODES.map((m) => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            value === m.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ── Notes feed ─────────────────────────────────────────────────────────────

function NotesFeed({ notes, groupMode, isExample }: { notes: Note[]; groupMode: GroupMode; isExample?: boolean }) {
  const groups = groupNotes(notes, groupMode);

  if (groupMode === "all") {
    return (
      <div className="space-y-2">
        {groups[0].notes.map((n) => <NoteCard key={n.id} note={n} isExample={isExample} />)}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="flex items-center gap-3 mb-3">
            {g.icon && (
              <span className={cn("p-1 rounded-md text-muted-foreground", TOPIC_COLOR[g.label] ?? "bg-muted")}>
                {g.icon}
              </span>
            )}
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{g.label}</h2>
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">{g.notes.length} email{g.notes.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-2">
            {g.notes.map((n) => <NoteCard key={n.id} note={n} isExample={isExample} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function PropertyCommunications() {
  const { id } = useParams<{ id: string }>();
  const propertyId = Number(id);
  const queryClient = useQueryClient();
  const { data: property } = useGetProperty(propertyId);
  const { data: notesByMonth, isLoading } = useGetEmailNotesPropertyId(propertyId);
  const { data: status } = useGetEmailStatus();
  const syncMutation = usePostEmailSyncPropertyId();
  const [isSyncing, setIsSyncing] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>("monthly");

  const connected = status?.connected ?? false;

  // Flatten grouped-by-month API response into a single array
  const realNotes: Note[] = (notesByMonth ?? []).flatMap((m) => m.notes);
  const hasReal = realNotes.length > 0;
  const showExample = !hasReal;

  const displayNotes = showExample ? EXAMPLE_NOTES : realNotes;
  const totalNotes = hasReal ? realNotes.length : EXAMPLE_NOTES.length;

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncMutation.mutateAsync({ propertyId });
      queryClient.invalidateQueries({ queryKey: [`/api/email/notes/${propertyId}`] });
    } finally { setIsSyncing(false); }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Link href="/app/communications" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Communications
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {property?.name ?? "Property"} — Communications
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{property?.address}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {showExample ? `${totalNotes} example emails` : `${totalNotes} email${totalNotes !== 1 ? "s" : ""} synced`}
          </span>
          <button
            onClick={handleSync}
            disabled={!connected || isSyncing}
            title={!connected ? "Connect your email in Communications settings first" : undefined}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              connected ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {isSyncing ? <><Loader2 className="w-4 h-4 animate-spin" /> Syncing…</> : <><RefreshCw className="w-4 h-4" /> Sync Now</>}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : (
        <div className="space-y-5">
          {/* Example data banner */}
          {showExample && (
            <div className="flex items-start gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-4 py-3">
              <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="text-sm">
                <span className="font-medium text-primary">Sample data — </span>
                <span className="text-muted-foreground">
                  {connected
                    ? "Sync your email to replace this with real communications for this property."
                    : <>Connect your email on the <Link href="/app/communications" className="text-primary hover:underline">Communications page</Link>, then sync to see real emails here.</>}
                </span>
              </div>
            </div>
          )}

          {/* Grouping toggles + count */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {groupMode === "topic" ? "Grouped by topic" : groupMode === "yearly" ? "Grouped by year" : groupMode === "all" ? "All communications" : "Grouped by month"}
            </p>
            <GroupToggles value={groupMode} onChange={setGroupMode} />
          </div>

          {/* Feed */}
          <NotesFeed notes={displayNotes} groupMode={groupMode} isExample={showExample} />
        </div>
      )}
    </div>
  );
}
