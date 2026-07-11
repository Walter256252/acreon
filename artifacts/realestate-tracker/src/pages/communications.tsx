import { useState } from "react";
import { Link } from "wouter";
import { Mail, Tag, MapPin, RefreshCw, Save, AlertCircle, CheckCircle2, ChevronRight, Info } from "lucide-react";
import { useGetGmailStatus, useGetGmailSettings, usePutGmailSettingsPropertyId, usePostGmailSync, usePostGmailSyncPropertyId } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type PullMode = "label" | "address";

interface LocalSetting {
  pullMode: PullMode;
  gmailLabel: string;
  dirty: boolean;
}

export default function Communications() {
  const queryClient = useQueryClient();
  const { data: status } = useGetGmailStatus();
  const { data: settings, isLoading } = useGetGmailSettings();
  const saveMutation = usePutGmailSettingsPropertyId();
  const syncAllMutation = usePostGmailSync();
  const syncOneMutation = usePostGmailSyncPropertyId();

  const [localSettings, setLocalSettings] = useState<Record<number, LocalSetting>>({});
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  const getLocal = (propertyId: number, server: { pullMode: string; gmailLabel: string | null }) => {
    return localSettings[propertyId] ?? {
      pullMode: (server.pullMode as PullMode) ?? "address",
      gmailLabel: server.gmailLabel ?? "",
      dirty: false,
    };
  };

  const update = (propertyId: number, patch: Partial<LocalSetting>, serverFallback: { pullMode: string; gmailLabel: string | null }) => {
    const current = getLocal(propertyId, serverFallback);
    setLocalSettings((prev) => ({
      ...prev,
      [propertyId]: { ...current, ...patch, dirty: true },
    }));
  };

  const handleSave = async (propertyId: number, local: LocalSetting) => {
    await saveMutation.mutateAsync({
      propertyId,
      data: { pullMode: local.pullMode, gmailLabel: local.gmailLabel || null },
    });
    setLocalSettings((prev) => {
      const next = { ...prev };
      if (next[propertyId]) next[propertyId] = { ...next[propertyId], dirty: false };
      return next;
    });
    setSavedIds((prev) => new Set(prev).add(propertyId));
    setTimeout(() => setSavedIds((prev) => { const s = new Set(prev); s.delete(propertyId); return s; }), 2000);
    queryClient.invalidateQueries({ queryKey: ["/api/gmail/settings"] });
  };

  const handleSyncOne = async (propertyId: number) => {
    setSyncingId(propertyId);
    try {
      await syncOneMutation.mutateAsync({ propertyId });
      queryClient.invalidateQueries({ queryKey: [`/api/gmail/notes/${propertyId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/settings"] });
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    await syncAllMutation.mutateAsync({});
    queryClient.invalidateQueries();
  };

  const connected = status?.connected ?? false;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Gmail Communications</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Sync property-related emails from Gmail and let AI summarize them into organized notes per property.
          </p>
        </div>
        {connected && (
          <button
            onClick={handleSyncAll}
            disabled={syncAllMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", syncAllMutation.isPending && "animate-spin")} />
            Sync All
          </button>
        )}
      </div>

      {/* Connection status banner */}
      {!connected && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">Gmail not connected</p>
            <p className="text-sm text-amber-700 mt-0.5">
              You can configure pull settings below, but syncing requires a connected Gmail account.
              Contact your administrator to connect Gmail via the Replit integrations panel.
            </p>
          </div>
        </div>
      )}

      {connected && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-800">Gmail connected — ready to sync</p>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">How to get your emails pulled in</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Label mode */}
          <div className="rounded-lg border border-border bg-background p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <Tag className="w-3.5 h-3.5 text-primary" />
              </div>
              <h3 className="font-semibold text-sm text-foreground">By Gmail Label</h3>
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Recommended</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Apply a label to any email thread in Gmail and RealTrack will pull it in automatically.
            </p>
            <ol className="text-sm text-muted-foreground space-y-1.5 list-none">
              <li className="flex gap-2"><span className="font-mono text-xs bg-muted rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0">1</span> In Gmail, click the label icon on any email thread</li>
              <li className="flex gap-2"><span className="font-mono text-xs bg-muted rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0">2</span> Create a label like <code className="text-xs bg-muted px-1 rounded">RealTrack/123 Main St</code></li>
              <li className="flex gap-2"><span className="font-mono text-xs bg-muted rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0">3</span> Enter that exact label name in the field below</li>
              <li className="flex gap-2"><span className="font-mono text-xs bg-muted rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0">4</span> To auto-label future emails: Gmail Settings → Filters → auto-apply label</li>
            </ol>
          </div>

          {/* Address mode */}
          <div className="rounded-lg border border-border bg-background p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-secondary/50 flex items-center justify-center">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-sm text-foreground">By Property Address</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              RealTrack searches your Gmail for the property's street address. Zero setup — just hit Sync.
            </p>
            <ol className="text-sm text-muted-foreground space-y-1.5 list-none">
              <li className="flex gap-2"><span className="font-mono text-xs bg-muted rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0">1</span> No setup needed in Gmail</li>
              <li className="flex gap-2"><span className="font-mono text-xs bg-muted rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0">2</span> RealTrack searches for the property street address</li>
              <li className="flex gap-2"><span className="font-mono text-xs bg-muted rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0">3</span> Works best when the address appears clearly in email bodies</li>
              <li className="flex gap-2"><span className="font-mono text-xs bg-muted rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0">4</span> May occasionally catch unrelated emails mentioning the address</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Per-property settings */}
      <div className="space-y-3">
        <h2 className="font-semibold text-foreground">Property Settings</h2>
        <p className="text-sm text-muted-foreground">Configure how each property pulls email. Click a property name to view its communication notes.</p>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {(settings ?? []).map((prop) => {
              const local = getLocal(prop.propertyId, prop);
              const saved = savedIds.has(prop.propertyId);
              const isSyncing = syncingId === prop.propertyId;

              return (
                <div key={prop.propertyId} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start gap-4 flex-wrap">
                    {/* Property info + link */}
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/app/communications/${prop.propertyId}`}
                        className="flex items-center gap-1.5 group w-fit"
                      >
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {prop.propertyName}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">{prop.propertyAddress}</p>
                      {prop.lastSynced && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                          Last synced: {new Date(prop.lastSynced).toLocaleString()}
                        </p>
                      )}
                    </div>

                    {/* Pull mode toggle */}
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
                      <button
                        onClick={() => update(prop.propertyId, { pullMode: "address" }, prop)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                          local.pullMode === "address"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <MapPin className="w-3 h-3" /> By Address
                      </button>
                      <button
                        onClick={() => update(prop.propertyId, { pullMode: "label" }, prop)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                          local.pullMode === "label"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Tag className="w-3 h-3" /> By Label
                      </button>
                    </div>

                    {/* Label input (label mode only) */}
                    {local.pullMode === "label" && (
                      <input
                        type="text"
                        placeholder="e.g. RealTrack/123 Main St"
                        value={local.gmailLabel}
                        onChange={(e) => update(prop.propertyId, { gmailLabel: e.target.value }, prop)}
                        className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 w-56"
                      />
                    )}

                    {/* Save */}
                    <button
                      onClick={() => handleSave(prop.propertyId, local)}
                      disabled={!local.dirty || saveMutation.isPending}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        saved
                          ? "bg-emerald-100 text-emerald-700"
                          : local.dirty
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "bg-muted text-muted-foreground cursor-not-allowed"
                      )}
                    >
                      {saved ? (
                        <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</>
                      ) : (
                        <><Save className="w-3.5 h-3.5" /> Save</>
                      )}
                    </button>

                    {/* Sync */}
                    <button
                      onClick={() => handleSyncOne(prop.propertyId)}
                      disabled={!connected || isSyncing}
                      title={!connected ? "Connect Gmail to sync" : undefined}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        connected
                          ? "border border-border bg-background hover:bg-muted text-foreground"
                          : "border border-border bg-muted text-muted-foreground cursor-not-allowed"
                      )}
                    >
                      <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} />
                      {isSyncing ? "Syncing…" : "Sync"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
