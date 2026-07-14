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

const KNOWN_IMAP: Record<string, { host: string; port: number; tls: boolean; provider: string }> = {
  "gmail.com":      { host: "imap.gmail.com",           port: 993, tls: true,  provider: "gmail" },
  "googlemail.com": { host: "imap.gmail.com",           port: 993, tls: true,  provider: "gmail" },
  "outlook.com":    { host: "outlook.office365.com",    port: 993, tls: true,  provider: "microsoft" },
  "hotmail.com":    { host: "outlook.office365.com",    port: 993, tls: true,  provider: "microsoft" },
  "live.com":       { host: "outlook.office365.com",    port: 993, tls: true,  provider: "microsoft" },
  "msn.com":        { host: "outlook.office365.com",    port: 993, tls: true,  provider: "microsoft" },
  "yahoo.com":      { host: "imap.mail.yahoo.com",      port: 993, tls: true,  provider: "yahoo" },
  "ymail.com":      { host: "imap.mail.yahoo.com",      port: 993, tls: true,  provider: "yahoo" },
  "icloud.com":     { host: "imap.mail.me.com",         port: 993, tls: true,  provider: "icloud" },
  "me.com":         { host: "imap.mail.me.com",         port: 993, tls: true,  provider: "icloud" },
  "mac.com":        { host: "imap.mail.me.com",         port: 993, tls: true,  provider: "icloud" },
  "aol.com":        { host: "imap.aol.com",             port: 993, tls: true,  provider: "aol" },
  "zoho.com":       { host: "imap.zoho.com",            port: 993, tls: true,  provider: "zoho" },
};

interface ProviderGuide {
  name: string;
  color: string;
  emoji: string;
  passwordLabel: string;
  steps: { text: React.ReactNode }[];
  link?: { href: string; label: string };
}

const PROVIDER_GUIDES: Record<string, ProviderGuide> = {
  gmail: {
    name: "Gmail",
    color: "bg-red-50 border-red-200",
    emoji: "✉️",
    passwordLabel: "App Password (16 characters)",
    steps: [
      { text: <>Go to your <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="text-primary underline font-medium">Google Account → Security</a></> },
      { text: "Enable 2-Step Verification if you haven't already" },
      { text: <>Open <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-primary underline font-medium">myaccount.google.com/apppasswords</a></> },
      { text: 'Under "Select app" choose Mail, click Generate' },
      { text: "Copy the 16-character password shown and paste it below" },
    ],
    link: { href: "https://myaccount.google.com/apppasswords", label: "Open App Passwords →" },
  },
  microsoft: {
    name: "Outlook / Hotmail",
    color: "bg-blue-50 border-blue-200",
    emoji: "📧",
    passwordLabel: "App Password",
    steps: [
      { text: <>Go to <a href="https://account.microsoft.com/security" target="_blank" rel="noreferrer" className="text-primary underline font-medium">account.microsoft.com/security</a></> },
      { text: "Click Advanced security options" },
      { text: "Under App passwords, click Create a new app password" },
      { text: "Copy the generated password and paste it below" },
    ],
    link: { href: "https://account.microsoft.com/security", label: "Open Microsoft Security →" },
  },
  yahoo: {
    name: "Yahoo Mail",
    color: "bg-purple-50 border-purple-200",
    emoji: "📬",
    passwordLabel: "App Password",
    steps: [
      { text: <>Sign in at <a href="https://login.yahoo.com" target="_blank" rel="noreferrer" className="text-primary underline font-medium">yahoo.com</a> and open Account Security</> },
      { text: "Click Generate app password" },
      { text: "Select Other app, give it any name (e.g. Acreon)" },
      { text: "Copy the password and paste it below" },
    ],
  },
  icloud: {
    name: "iCloud Mail",
    color: "bg-sky-50 border-sky-200",
    emoji: "☁️",
    passwordLabel: "App-Specific Password",
    steps: [
      { text: <>Go to <a href="https://appleid.apple.com" target="_blank" rel="noreferrer" className="text-primary underline font-medium">appleid.apple.com</a> and sign in</> },
      { text: "Under Security, click App-Specific Passwords → Generate" },
      { text: "Give it any name (e.g. Acreon) and click Create" },
      { text: "Copy the password shown and paste it below" },
    ],
    link: { href: "https://appleid.apple.com", label: "Open Apple ID →" },
  },
  aol: {
    name: "AOL Mail",
    color: "bg-orange-50 border-orange-200",
    emoji: "📩",
    passwordLabel: "App Password",
    steps: [
      { text: <>Go to <a href="https://login.aol.com" target="_blank" rel="noreferrer" className="text-primary underline font-medium">AOL Account Security</a></> },
      { text: "Click Generate and manage app passwords" },
      { text: "Select Other App, enter Acreon, click Generate" },
      { text: "Copy the password and paste it below" },
    ],
  },
  zoho: {
    name: "Zoho Mail",
    color: "bg-green-50 border-green-200",
    emoji: "📮",
    passwordLabel: "Password or App Password",
    steps: [
      { text: "Use your regular Zoho password below" },
      { text: "If you have 2FA enabled, go to Zoho Account → Security → App Passwords" },
      { text: "Generate one for Acreon and use that instead" },
    ],
  },
};

function detectImap(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain ? KNOWN_IMAP[domain] ?? null : null;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Connect email form — 2-step wizard ───────────────────────────────────

function ConnectEmailForm({ onConnected }: { onConnected: () => void }) {
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // manual IMAP override (shown only for unknown providers)
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [imapTls, setImapTls] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const connectMutation = usePostEmailConnect();
  const detected = detectImap(email);
  const guide = detected?.provider ? PROVIDER_GUIDES[detected.provider] ?? null : null;
  const isUnknown = step === "password" && !detected;

  const handleContinue = () => {
    if (!isValidEmail(email)) { setError("Please enter a valid email address."); return; }
    setError(null);
    setStep("password");
  };

  const handleBack = () => {
    setStep("email");
    setPassword("");
    setError(null);
  };

  const handleConnect = async () => {
    setError(null);
    if (!password) { setError("Please enter your password."); return; }
    const host = detected?.host || imapHost;
    if (!host) { setError("Enter the IMAP server address below."); return; }

    try {
      await connectMutation.mutateAsync({
        data: {
          displayEmail: email,
          imapHost: host,
          imapPort: Number(detected?.port || imapPort) || 993,
          imapEmail: email,
          imapPassword: password,
          imapTls: detected?.tls ?? imapTls,
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
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
          <Mail className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Connect Your Email</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Works with Gmail, Outlook, Yahoo, iCloud, and most email providers
          </p>
        </div>
        {/* Step dots */}
        <div className="ml-auto flex items-center gap-1.5">
          {(["email", "password"] as const).map((s, i) => (
            <div key={s} className={cn("rounded-full transition-all", step === s ? "w-5 h-2 bg-primary" : "w-2 h-2 bg-muted-foreground/30")} />
          ))}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* ── Step 1: email ── */}
        {step === "email" && (
          <>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Enter the email address you want to connect. Acreon will search it for property-related emails
              and turn them into AI-generated notes.
            </p>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">Your email address</label>
              <input
                type="email"
                autoFocus
                placeholder="you@gmail.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleContinue()}
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {detected && (
                <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {guide?.name ?? detected.host} detected — we know how to connect this
                </p>
              )}
              {email.includes("@") && !email.includes("@", email.indexOf("@") + 1) && !detected && email.split("@")[1]?.includes(".") && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Custom domain — you'll need your mail server details in the next step
                </p>
              )}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              onClick={handleContinue}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Continue →
            </button>
          </>
        )}

        {/* ── Step 2: password ── */}
        {step === "password" && (
          <>
            {/* Provider guide */}
            {guide ? (
              <div className={cn("rounded-xl border p-4 space-y-3", guide.color)}>
                <p className="font-semibold text-sm text-foreground">
                  {guide.emoji} {guide.name} requires an App Password
                </p>
                <p className="text-xs text-muted-foreground">
                  For security, {guide.name} doesn't allow your regular password here. Follow these steps to create a special one:
                </p>
                <ol className="space-y-2">
                  {guide.steps.map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-xs text-foreground">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center font-semibold text-muted-foreground">{i + 1}</span>
                      <span className="leading-relaxed mt-0.5">{s.text}</span>
                    </li>
                  ))}
                </ol>
                {guide.link && (
                  <a
                    href={guide.link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    {guide.link.label}
                  </a>
                )}
              </div>
            ) : (
              /* Unknown provider */
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                <p className="font-semibold text-sm text-foreground">Custom or business email</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  We don't recognise this domain. You'll need your mail server details — check
                  with your email provider or IT administrator if you're not sure.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-foreground block mb-1">IMAP Server</label>
                    <input
                      type="text"
                      placeholder="imap.yourprovider.com"
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
                    <input type="checkbox" id="imap-tls" checked={imapTls} onChange={(e) => setImapTls(e.target.checked)} className="rounded" />
                    <label htmlFor="imap-tls" className="text-xs text-foreground">Use SSL/TLS (recommended)</label>
                  </div>
                </div>
              </div>
            )}

            {/* Password field */}
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                {guide?.passwordLabel ?? "Password"}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoFocus
                  placeholder="Paste your password here"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                  className="w-full border border-border rounded-lg px-3 py-2.5 pr-10 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Connecting as <span className="font-medium text-foreground">{email}</span> —{" "}
                <button onClick={handleBack} className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">
                  change email
                </button>
              </p>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleConnect}
                disabled={connectMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {connectMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Testing connection…</>
                ) : (
                  <><Wifi className="w-4 h-4" /> Connect</>
                )}
              </button>
            </div>
          </>
        )}
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

  const numProperties = (settings ?? []).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Mail className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Communications</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Connect your email and let AI turn property-related threads into organized monthly notes.
        </p>
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
              <li className="flex gap-2"><span className="text-xs bg-muted rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5">1</span> In Gmail: create a label like <code className="text-xs bg-muted px-1 rounded">Acreon/123 Main St</code></li>
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
            <p className="text-sm text-muted-foreground">Acreon searches your inbox for the property's street address. Zero setup required.</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li className="flex gap-2"><span className="text-xs bg-muted rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5">1</span> No setup needed in your email client</li>
              <li className="flex gap-2"><span className="text-xs bg-muted rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5">2</span> Searches for the street name in email subject &amp; body</li>
              <li className="flex gap-2"><span className="text-xs bg-muted rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5">3</span> May occasionally catch unrelated emails</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Sync All card */}
      <div className={cn(
        "rounded-xl border p-5 flex items-center justify-between gap-4 flex-wrap",
        connected ? "border-primary/20 bg-primary/5" : "border-border bg-card"
      )}>
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
            connected ? "bg-primary/15" : "bg-muted"
          )}>
            <RefreshCw className={cn("w-4 h-4", connected ? "text-primary" : "text-muted-foreground")} />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Sync all properties at once</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {connected
                ? `Checks every property for new emails in one go${numProperties > 0 ? ` across ${numProperties} propert${numProperties !== 1 ? "ies" : "y"}` : ""}.`
                : "Connect your email above to enable syncing."}
            </p>
          </div>
        </div>
        <button
          onClick={handleSyncAll}
          disabled={!connected || syncAllMutation.isPending}
          title={!connected ? "Connect your email first" : undefined}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shrink-0",
            connected
              ? "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          <RefreshCw className={cn("w-4 h-4", syncAllMutation.isPending && "animate-spin")} />
          {syncAllMutation.isPending ? "Syncing all…" : "Sync All Properties"}
        </button>
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
                        placeholder="e.g. Acreon/123 Main St"
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
