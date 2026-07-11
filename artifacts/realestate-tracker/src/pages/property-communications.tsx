import { useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, RefreshCw, Mail, Users, Calendar, Lightbulb, ChevronDown, ChevronUp, Inbox, Loader2 } from "lucide-react";
import { useGetProperty, useGetEmailNotesPropertyId, usePostEmailSyncPropertyId, useGetEmailStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

function MonthLabel({ monthYear }: { monthYear: string }) {
  const [year, month] = monthYear.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return <span>{date.toLocaleString("default", { month: "long" })} {year}</span>;
}

function NoteCard({ note }: {
  note: {
    id: number; subject: string; participants: string[];
    aiSummary: string; actionItems: string[];
    keyDates: { date: string; description: string }[];
    threadDate: string;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Mail className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground text-sm truncate">{note.subject}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(note.threadDate).toLocaleDateString("default", { weekday: "short", month: "short", day: "numeric" })}
            {note.participants.length > 0 && (
              <span className="ml-2 text-muted-foreground/70">
                · {note.participants.slice(0, 2).join(", ")}{note.participants.length > 2 ? ` +${note.participants.length - 2}` : ""}
              </span>
            )}
          </p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />}
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
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
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

export default function PropertyCommunications() {
  const { id } = useParams<{ id: string }>();
  const propertyId = Number(id);
  const queryClient = useQueryClient();
  const { data: property } = useGetProperty({ id: propertyId });
  const { data: notesByMonth, isLoading } = useGetEmailNotesPropertyId({ propertyId });
  const { data: status } = useGetEmailStatus();
  const syncMutation = usePostEmailSyncPropertyId();
  const [isSyncing, setIsSyncing] = useState(false);

  const connected = status?.connected ?? false;
  const totalNotes = notesByMonth?.reduce((s, m) => s + m.notes.length, 0) ?? 0;

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

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {property?.name ?? "Property"} — Communications
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{property?.address}</p>
        </div>
        <div className="flex items-center gap-3">
          {totalNotes > 0 && (
            <span className="text-sm text-muted-foreground">{totalNotes} email{totalNotes !== 1 ? "s" : ""} synced</span>
          )}
          <button
            onClick={handleSync}
            disabled={!connected || isSyncing}
            title={!connected ? "Connect your email in Communications settings first" : undefined}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              connected ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {isSyncing ? <><Loader2 className="w-4 h-4 animate-spin" /> Syncing…</> : <><RefreshCw className="w-4 h-4" /> Sync Now</>}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : !notesByMonth || notesByMonth.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <Inbox className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">No communications yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {connected
              ? "Hit Sync Now to pull in emails for this property. Make sure you've saved the pull settings on the Communications page."
              : "Connect your email account on the Communications page first, then sync to see notes here."}
          </p>
          <Link href="/app/communications" className="mt-4 text-sm text-primary hover:underline">
            Go to Communications →
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {notesByMonth.map((month) => (
            <div key={month.monthYear}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  <MonthLabel monthYear={month.monthYear} />
                </h2>
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">{month.notes.length} email{month.notes.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-2">
                {month.notes.map((note) => <NoteCard key={note.id} note={note} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
