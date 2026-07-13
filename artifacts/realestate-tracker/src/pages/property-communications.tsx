import { useState } from "react";
import { Link, useParams } from "wouter";
import {
  ArrowLeft, RefreshCw, Mail, Users, Calendar, Lightbulb, ChevronDown, ChevronUp,
  Inbox, Loader2, Wrench, FileText, DollarSign, Search, Scale, Sparkles, Clock,
} from "lucide-react";
import {
  useGetProperty, useGetEmailNotesPropertyId, usePostEmailSyncPropertyId,
  useGetEmailStatus, useGetEmailSettings,
} from "@workspace/api-client-react";

// ── Relative time ─────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
  return new Date(dateStr).toLocaleDateString();
}
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
  "Maintenance & Repairs": "bg-slate-100 text-slate-700 border-slate-200",
  "Lease & Tenants":       "bg-blue-100 text-blue-700 border-blue-200",
  "Payments & Finances":   "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Inspections":           "bg-violet-100 text-violet-700 border-violet-200",
  "Legal & HOA":           "bg-red-100 text-red-700 border-red-200",
  "General":               "bg-muted text-muted-foreground border-border",
};


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

function NoteCard({ note }: { note: Note }) {
  const [expanded, setExpanded] = useState(false);
  const topic = detectTopic(note);

  return (
    <div className={cn("rounded-lg border bg-background overflow-hidden", "border-border")}>
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
                  <Lightbulb className="w-3.5 h-3.5 text-emerald-600" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action Items</p>
                </div>
                <ul className="space-y-1">
                  {note.actionItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
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

function NotesFeed({ notes, groupMode }: { notes: Note[]; groupMode: GroupMode }) {
  const groups = groupNotes(notes, groupMode);

  if (groupMode === "all") {
    return (
      <div className="space-y-2">
        {groups[0].notes.map((n) => <NoteCard key={n.id} note={n} />)}
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
            {g.notes.map((n) => <NoteCard key={n.id} note={n} />)}
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
  const { data: allSettings } = useGetEmailSettings();
  const syncMutation = usePostEmailSyncPropertyId();
  const [isSyncing, setIsSyncing] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>("monthly");

  const lastSynced = allSettings?.find((s) => s.propertyId === propertyId)?.lastSynced ?? null;

  const connected = status?.connected ?? false;

  // Flatten grouped-by-month API response into a single array
  const realNotes: Note[] = (notesByMonth ?? []).flatMap((m) => m.notes);
  const hasNotes = realNotes.length > 0;

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
          <div className="flex items-center gap-3 mb-1">
            <Mail className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {property?.name ?? "Property"} — Communications
            </h1>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">{property?.address}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            {hasNotes && (
              <span className="text-sm text-muted-foreground">
                {realNotes.length} email{realNotes.length !== 1 ? "s" : ""} synced
              </span>
            )}
            {lastSynced && hasNotes && (
              <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground/60 mt-0.5">
                <Clock className="w-3 h-3" /> Last synced {relativeTime(lastSynced)}
              </p>
            )}
          </div>
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
      ) : !hasNotes ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-border">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Inbox className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">No emails synced yet</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            {connected
              ? "Click \"Sync Now\" to pull in emails for this property."
              : <>Connect your email on the <Link href="/app/communications" className="text-primary hover:underline">Communications page</Link>, then sync to see real emails here.</>}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Grouping toggles + count */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {groupMode === "topic" ? "Grouped by topic" : groupMode === "yearly" ? "Grouped by year" : groupMode === "all" ? "All communications" : "Grouped by month"}
            </p>
            <GroupToggles value={groupMode} onChange={setGroupMode} />
          </div>

          {/* Feed */}
          <NotesFeed notes={realNotes} groupMode={groupMode} />
        </div>
      )}
    </div>
  );
}
