import { useState } from "react";
import { Link } from "wouter";
import {
  Mail, Tag, MapPin, RefreshCw, Save, CheckCircle2, ChevronRight,
  Info, Eye, EyeOff, X, Wifi, WifiOff, Loader2, Clock,
} from "lucide-react";

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
import {
  useGetEmailStatus,
  useGetEmailSettings,
  usePutEmailSettingsPropertyId,
  usePostEmailSync,
  usePostEmailSyncPropertyId,
  usePostEmailConnect,
  useDeleteEmailConnection,
  useGetEmailConnection,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// ── IMAP auto-detection ───────────────────────────────────────────────────

const KNOWN_IMAP: Record<string, { host: string; port: number; tls: boolean; note?: string }> = {
  "gmail.com": { host: "imap.gmail.com", port: 993, tls: true, note: "gmail" },
  "googlemail.com": { host: "imap.gmail.com", port: 993, tls: true, note: "gmail" },
  "outlook.com": { host: "outlook.office365.com", port: 993, tls: true, note: "microsoft" },
  "hotmail.com": { host: "outlook.office365.com", port: 993, tls: true, note: "microsoft" },
  "live.com": { host: "outlook.office365.com", port: 993, tls: true, note: "microsoft" },
  "msn.com": { host: "outlook.office365.com", port: 993, tls: true, note: "microsoft" },
  "yahoo.com": { host: "imap.mail.yahoo.com", port: 993, tls: true, note: "yahoo" },
  "ymail.com": { host: "imap.mail.yahoo.com", port: 993, tls: true, note: "yahoo" },
  "icloud.com": { host: "imap.mail.me.com", port: 993, tls: true, note: "icloud" },
  "me.com": { host: "imap.mail.me.com", port: 993, tls: true, note: "icloud" },
  "mac.com": { host: "imap.mail.me.com", port: 993, tls: true, note: "icloud" },
  "aol.com": { host: "imap.aol.com", port: 993, tls: true },
  "zoho.com": { host: "imap.zoho.com", port: 993, tls: true },
  "protonmail.com": { host: "127.0.0.1", port: 1143, tls: false, note: "proton" },
  "pm.me": { host: "127.0.0.1", port: 1143, tls: false, note: "proton" },
};

const APP_PASSWORD_NOTES: Record<string, React.ReactNode> = {
  gmail: (
    <p className="text-xs text-amber-700 leading-relaxed">
      <strong>Gmail requires an App Password</strong>, not your regular password.{" "}
      <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline">
        Create one at myaccount.google.com/apppasswords
      </a>{" "}
      (requires 2-Step Verification to be enabled first).
    </p>
  ),
  microsoft: (
    <p className="text-xs text-amber-700 leading-relaxed">
      <strong>Outlook/Hotmail requires an App Password</strong> if you have 2FA enabled.{" "}
      Go to Microsoft Account → Security → Advanced security → App passwords.
    </p>
  ),
  yahoo: (
    <p className="text-xs text-amber-700 leading-relaxed">
      <strong>Yahoo requires an App Password.</strong>{" "}
      Go to Yahoo Account Security → Generate app password → select Mail.
    </p>
  ),
  icloud: (
    <p className="text-xs text-amber-700 leading-relaxed">
      <strong>iCloud requires an App-Specific Password.</strong>{" "}
      Go to{" "}
      <a href="https://appleid.apple.com" target="_blank" rel="noreferrer" className="underline">
        appleid.apple.com
      </a>{" "}
      → Security → App-Specific Passwords → Generate.
    </p>
  ),
  proton: (
    <p className="text-xs text-amber-700 leading-relaxed">
      <strong>ProtonMail requires the Proton Mail Bridge app</strong> to be running locally.
      Download it at proton.me/mail/bridge.
    </p>
  ),
};

function detectImap(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain ? KNOWN_IMAP[domain] ?? null : null;
}

// ── Connect email form ────────────────────────────────────────────────────

function ConnectEmailForm({ onConnected }: { onConnected: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [imapTls, setImapTls] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectMutation = usePostEmailConnect();
  const detected = detectImap(email);
  const note = detected?.note;

  const handleEmailChange = (val: string) => {
    setEmail(val);
    const d = detectImap(val);
    if (d) {
      setImapHost(d.host);
      setImapPort(String(d.port));
      setImapTls(d.tls);
    }
  };

  const handleConnect = async () => {
    setError(null);
    if (!email || !password) { setError("Email and password are required."); return; }
    const host = imapHost || detected?.host;
    if (!host) { setError("Could not detect IMAP server. Please expand Advanced Settings and enter it manually."); return; }

    try {
      await connectMutation.mutateAsync({
        data: {
          displayEmail: email,
          imapHost: host,
          imapPort: Number(imapPort) || 993,
          imapEmail: email,
          imapPassword: password,
          imapTls,
        },
      });
      onConnected();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err instanceof Error ? err.message : "Connection failed");
      setError(msg);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Mail className="w-5 h-5 text-primary" />
        <h2 className="font-semibold text-foreground text-lg">Connect Your Email</h2>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">
        Connect your personal email account and RealTrack will search it for property-related
        emails and turn them into AI-generated notes. Works with Gmail, Outlook, Yahoo, iCloud,
        and any provider that supports IMAP.
      </p>

      <div className="space-y-3">
        {/* Email */}
        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Email address</label>
          <input
            type="email"
            placeholder="you@gmail.com"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {detected && (
            <p className="text-xs text-muted-foreground mt-1">
              ✓ Detected: {detected.host}:{detected.port}
            </p>
          )}
        </div>

        {/* App password note */}
        {note && note in APP_PASSWORD_NOTES && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            {APP_PASSWORD_NOTES[note]}
          </div>
        )}

        {/* Password */}
        <div>
          <label className="text-xs font-medium text-foreground block mb-1">
            {note === "gmail" || note === "microsoft" || note === "yahoo" || note === "icloud"
              ? "App Password"
              : "Password"}
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="••••••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 pr-10 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Advanced settings toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <span>{showAdvanced ? "▲" : "▶"}</span> Advanced IMAP settings
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-foreground block mb-1">IMAP Host</label>
              <input
                type="text"
                placeholder="imap.example.com"
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Port</label>
              <input
                type="number"
                value={imapPort}
                onChange={(e) => setImapPort(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="col-span-3 flex items-center gap-2">
              <input
                type="checkbox"
                id="imap-tls"
                checked={imapTls}
                onChange={(e) => setImapTls(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="imap-tls" className="text-sm text-foreground">Use TLS/SSL</label>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <button
          onClick={handleConnect}
          disabled={connectMutation.isPending}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {connectMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Testing connection…</>
          ) : (
            <><Wifi className="w-4 h-4" /> Test &amp; Connect</>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Connected status card ─────────────────────────────────────────────────

function ConnectedCard({ email, onDisconnect }: { email: string; onDisconnect: () => void }) {
  const disconnectMutation = useDeleteEmailConnection();

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect ${email}? Your synced notes will be kept but future syncing will stop.`)) return;
    await disconnectMutation.mutateAsync();
    onDisconnect();
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
      <p className="text-sm font-medium text-emerald-800 flex-1">
        Connected as <span className="font-bold">{email}</span>
      </p>
      <button
        onClick={handleDisconnect}
        disabled={disconnectMutation.isPending}
        className="flex items-center gap-1.5 text-xs text-emerald-700 hover:text-red-600 transition-colors"
      >
        <X className="w-3.5 h-3.5" /> Disconnect
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

type PullMode = "label" | "address";

interface LocalSetting {
  pullMode: PullMode;
  emailFolder: string;
  dirty: boolean;
}

export default function Communications() {
  const queryClient = useQueryClient();
  const { data: status, refetch: refetchStatus } = useGetEmailStatus();
  const { data: connDetail } = useGetEmailConnection();
  const { data: settings, isLoading } = useGetEmailSettings();
  const saveMutation = usePutEmailSettingsPropertyId();
  const syncAllMutation = usePostEmailSync();
  const syncOneMutation = usePostEmailSyncPropertyId();

  const [localSettings, setLocalSettings] = useState<Record<number, LocalSetting>>({});
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  const connected = status?.connected ?? false;
  const connEmail = status?.email ?? connDetail?.displayEmail ?? "";

  const getLocal = (id: number, server: { pullMode: string; emailFolder: string | null }): LocalSetting =>
    localSettings[id] ?? { pullMode: (server.pullMode as PullMode) ?? "address", emailFolder: server.emailFolder ?? "", dirty: false };

  const update = (id: number, patch: Partial<LocalSetting>, server: { pullMode: string; emailFolder: string | null }) => {
    setLocalSettings((prev) => ({ ...prev, [id]: { ...getLocal(id, server), ...patch, dirty: true } }));
  };

  const handleSave = async (propertyId: number, local: LocalSetting) => {
    await saveMutation.mutateAsync({
      propertyId,
      data: { pullMode: local.pullMode, emailFolder: local.emailFolder || null },
    });
    setLocalSettings((prev) => ({ ...prev, [propertyId]: { ...prev[propertyId], dirty: false } }));
    setSavedIds((prev) => new Set(prev).add(propertyId));
    setTimeout(() => setSavedIds((prev) => { const s = new Set(prev); s.delete(propertyId); return s; }), 2000);
    queryClient.invalidateQueries({ queryKey: ["/api/email/settings"] });
  };

  const handleSyncOne = async (propertyId: number) => {
    setSyncingId(propertyId);
    try {
      await syncOneMutation.mutateAsync({ propertyId });
      queryClient.invalidateQueries({ queryKey: [`/api/email/notes/${propertyId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/settings"] });
    } finally { setSyncingId(null); }
  };

  const handleSyncAll = async () => {
    await syncAllMutation.mutateAsync();
    queryClient.invalidateQueries();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Communications</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Connect your email and let AI turn property-related threads into organized monthly notes.
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

      {/* Connect form or connected status */}
      {!connected ? (
        <ConnectEmailForm onConnected={() => { refetchStatus(); queryClient.invalidateQueries(); }} />
      ) : (
        <ConnectedCard email={connEmail} onDisconnect={() => { refetchStatus(); queryClient.invalidateQueries(); }} />
      )}

      {/* How it works — always visible */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">How to get emails pulled in</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-background p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <Tag className="w-3.5 h-3.5 text-primary" />
              </div>
              <h3 className="font-semibold text-sm text-foreground">By Folder / Label</h3>
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Recommended</span>
            </div>
            <p className="text-sm text-muted-foreground">Create a folder or label in your email client for each property and move threads there.</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li className="flex gap-2"><span className="text-xs bg-muted rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5">1</span> In Gmail: create a label like <code className="text-xs bg-muted px-1 rounded">RealTrack/123 Main St</code></li>
              <li className="flex gap-2"><span className="text-xs bg-muted rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5">2</span> In Outlook: create a subfolder with the property name</li>
              <li className="flex gap-2"><span className="text-xs bg-muted rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5">3</span> Enter the exact folder name below, then Sync</li>
              <li className="flex gap-2"><span className="text-xs bg-muted rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5">4</span> Tip: set up a filter to auto-label emails from tenants</li>
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-background p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-secondary/50 flex items-center justify-center">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-sm text-foreground">By Address</h3>
            </div>
            <p className="text-sm text-muted-foreground">RealTrack searches your inbox for the property's street address. Zero setup required.</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li className="flex gap-2"><span className="text-xs bg-muted rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5">1</span> No setup needed in your email client</li>
              <li className="flex gap-2"><span className="text-xs bg-muted rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5">2</span> Searches for the street name in email subject &amp; body</li>
              <li className="flex gap-2"><span className="text-xs bg-muted rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5">3</span> May occasionally catch unrelated emails</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Per-property settings */}
      <div className="space-y-3">
        <h2 className="font-semibold text-foreground">Property Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure how each property pulls email. Click a property name to view its synced notes.
        </p>
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : (
          <div className="space-y-3">
            {(settings ?? []).map((prop) => {
              const local = getLocal(prop.propertyId, prop);
              const saved = savedIds.has(prop.propertyId);
              const isSyncing = syncingId === prop.propertyId;

              return (
                <div key={prop.propertyId} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start gap-3 flex-wrap">
                    {/* Property info */}
                    <div className="flex-1 min-w-48">
                      <Link href={`/app/communications/${prop.propertyId}`} className="flex items-center gap-1.5 group w-fit">
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors">{prop.propertyName}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">{prop.propertyAddress}</p>
                      {prop.lastSynced && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground/60 mt-0.5">
                          <Clock className="w-3 h-3" /> Last synced {relativeTime(prop.lastSynced)}
                        </p>
                      )}
                    </div>

                    {/* Mode toggle */}
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
                      {(["address", "label"] as PullMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => update(prop.propertyId, { pullMode: mode }, prop)}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                            local.pullMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {mode === "address" ? <><MapPin className="w-3 h-3" /> By Address</> : <><Tag className="w-3 h-3" /> By Folder</>}
                        </button>
                      ))}
                    </div>

                    {/* Folder input */}
                    {local.pullMode === "label" && (
                      <input
                        type="text"
                        placeholder="e.g. RealTrack/123 Main St"
                        value={local.emailFolder}
                        onChange={(e) => update(prop.propertyId, { emailFolder: e.target.value }, prop)}
                        className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
                      />
                    )}

                    {/* Save */}
                    <button
                      onClick={() => handleSave(prop.propertyId, local)}
                      disabled={!local.dirty || saveMutation.isPending}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        saved ? "bg-emerald-100 text-emerald-700"
                          : local.dirty ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "bg-muted text-muted-foreground cursor-not-allowed"
                      )}
                    >
                      {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</> : <><Save className="w-3.5 h-3.5" /> Save</>}
                    </button>

                    {/* Sync */}
                    <button
                      onClick={() => handleSyncOne(prop.propertyId)}
                      disabled={!connected || isSyncing}
                      title={!connected ? "Connect your email first" : undefined}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                        connected ? "border-border bg-background hover:bg-muted text-foreground" : "border-border bg-muted text-muted-foreground cursor-not-allowed"
                      )}
                    >
                      {isSyncing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing…</> : <><RefreshCw className="w-3.5 h-3.5" /> Sync</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Not connected bottom hint */}
      {!connected && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <WifiOff className="w-4 h-4" />
          <span>Connect your email above to enable syncing. Settings can be configured now.</span>
        </div>
      )}
    </div>
  );
}
