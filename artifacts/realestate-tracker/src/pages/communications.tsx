import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  Mail, Tag, MapPin, RefreshCw, Save, CheckCircle2, ChevronRight,
  Info, Eye, EyeOff, X, Wifi, WifiOff, Loader2, Clock,
  ChevronDown, ChevronUp, Sparkles,
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
import { useQueryClient, useQuery } from "@tanstack/react-query";
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

// ── Gmail OAuth step ─────────────────────────────────────────────────────

function GmailOAuthStep({
  email,
  onBack,
  error,
  setError,
}: {
  email: string;
  onBack: () => void;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleSignInWithGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const returnTo = window.location.href.split("?")[0]; // strip any existing params
      const res = await fetch(`/api/email/gmail/auth-url?returnTo=${encodeURIComponent(returnTo)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Could not start Google sign-in. Please try again.");
        setLoading(false);
        return;
      }
      const { url } = await res.json() as { url: string };
      window.location.href = url;
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 space-y-4">
        {/* Google logo + text */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white border border-red-200 flex items-center justify-center flex-shrink-0">
            {/* Google "G" logo using coloured spans */}
            <span className="text-base font-bold" style={{ fontFamily: "sans-serif" }}>
              <span style={{ color: "#4285F4" }}>G</span>
            </span>
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">Sign in with Google</p>
            <p className="text-xs text-muted-foreground">No passwords or app passwords needed</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Click the button below and sign in to <span className="font-medium text-foreground">{email}</span> in the
          Google window that opens. Acreon will only be able to <strong>read</strong> your emails — it cannot
          send, delete, or modify anything.
        </p>
        <button
          onClick={handleSignInWithGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 shadow-sm transition-colors"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin text-gray-500" /> Opening Google…</>
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Back
      </button>
    </div>
  );
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
  const [isGoogleWorkspace, setIsGoogleWorkspace] = useState(false);
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

        {/* ── Step 2: connect ── */}
        {step === "password" && (
          <>
            {/* Gmail — OAuth button */}
            {detected?.provider === "gmail" ? (
              <GmailOAuthStep
                email={email}
                onBack={handleBack}
                error={error}
                setError={setError}
              />
            ) : (
              <>
                {/* Other known providers — App Password guide */}
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
                      <a href={guide.link.href} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
                        {guide.link.label}
                      </a>
                    )}
                  </div>
                ) : (
                  /* Unknown / custom domain */
                  <div className="space-y-3">
                    {/* Google Workspace toggle */}
                    <button
                      type="button"
                      onClick={() => { setIsGoogleWorkspace((v) => !v); setError(null); }}
                      className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                        isGoogleWorkspace
                          ? "border-blue-300 bg-blue-50"
                          : "border-border bg-muted/30 hover:bg-muted/50"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-white border border-border flex items-center justify-center flex-shrink-0 shadow-sm">
                        <span className="text-sm font-bold" style={{ fontFamily: "sans-serif" }}>
                          <span style={{ color: "#4285F4" }}>G</span>
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">This email is hosted by Google Workspace</p>
                        <p className="text-xs text-muted-foreground">Sign in with Google — no passwords needed</p>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                        isGoogleWorkspace ? "border-blue-500 bg-blue-500" : "border-muted-foreground"
                      }`}>
                        {isGoogleWorkspace && <div className="w-full h-full rounded-full bg-white scale-[0.4]" />}
                      </div>
                    </button>

                    {isGoogleWorkspace ? (
                      /* Show OAuth button */
                      <GmailOAuthStep email={email} onBack={() => setIsGoogleWorkspace(false)} error={error} setError={setError} />
                    ) : (
                      /* IMAP details for truly unknown providers */
                      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
                        <div>
                          <p className="font-semibold text-sm text-foreground mb-1">Custom or business email</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            We don't automatically know how to reach this email provider, so you'll need to tell us where
                            your mail server lives. Think of it like a postal address for your inbox — every provider
                            has one, and your email provider's support pages will list it.
                          </p>
                        </div>
                        <div className="rounded-lg bg-background border border-border px-3 py-2.5 space-y-1">
                          <p className="text-xs font-medium text-foreground">How to find these details</p>
                          <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                            <li>Google <span className="font-medium text-foreground">"{email.split("@")[1] ?? "yourprovider"} IMAP settings"</span></li>
                            <li>Open your email app's account settings — look for "Incoming server"</li>
                            <li>Or ask whoever manages your company email (IT / admin)</li>
                          </ul>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="col-span-2">
                            <label className="text-xs font-medium text-foreground block mb-1">
                              IMAP Server <span className="text-muted-foreground font-normal">(Incoming mail server)</span>
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. imap.yourprovider.com"
                              value={imapHost}
                              onChange={(e) => setImapHost(e.target.value)}
                              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-foreground block mb-1">
                              Port <span className="text-muted-foreground font-normal">(usually 993)</span>
                            </label>
                            <input
                              type="number"
                              value={imapPort}
                              onChange={(e) => setImapPort(e.target.value)}
                              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </div>
                          <div className="col-span-3 flex items-center gap-2">
                            <input type="checkbox" id="imap-tls" checked={imapTls} onChange={(e) => setImapTls(e.target.checked)} className="rounded" />
                            <label htmlFor="imap-tls" className="text-xs text-foreground">Use SSL/TLS <span className="text-muted-foreground">(leave on unless told otherwise)</span></label>
                          </div>
                        </div>
                      </div>
                    )}
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
                  <button onClick={handleBack}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                    ← Back
                  </button>
                  <button onClick={handleConnect} disabled={connectMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                    {connectMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Testing connection…</>
                    ) : (
                      <><Wifi className="w-4 h-4" /> Connect</>
                    )}
                  </button>
                </div>
              </>
            )}
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
  useLocation(); // used to read search params on mount

  const [localSettings, setLocalSettings] = useState<Record<number, LocalSetting>>({});
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [oauthBanner, setOauthBanner] = useState<"success" | "denied" | "error" | null>(null);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [syncSummary, setSyncSummary] = useState<{
    total: number;
    results: { propertyId: number; propertyName: string; synced: number }[];
    showNewOnly: boolean;
  } | null>(null);

  // Detect Gmail OAuth callback result from query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("gmail_connected");
    const oauthError = params.get("gmail_error");
    if (connected === "1") {
      setOauthBanner("success");
      void refetchStatus();
      void queryClient.invalidateQueries();
      // Clean the URL
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    } else if (oauthError) {
      setOauthBanner(oauthError === "access_denied" ? "denied" : "error");
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connected = status?.connected ?? false;
  const connEmail = status?.email ?? connDetail?.displayEmail ?? "";

  // Fetch real Gmail labels for the picker (after `connected` is defined)
  const { data: gmailLabelsData } = useQuery<{ labels: { id: string; name: string }[] }>({
    queryKey: ["/api/email/gmail/labels"],
    queryFn: async () => {
      const res = await fetch("/api/email/gmail/labels");
      if (!res.ok) return { labels: [] };
      return res.json() as Promise<{ labels: { id: string; name: string }[] }>;
    },
    enabled: connected,
    staleTime: 60_000,
  });
  const gmailLabels = gmailLabelsData?.labels ?? [];

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
    const result = await syncAllMutation.mutateAsync() as {
      synced: number;
      results: { propertyId: number; propertyName: string; synced: number }[];
    };
    queryClient.invalidateQueries();
    setSyncSummary({
      total: result.synced ?? 0,
      results: result.results ?? [],
      showNewOnly: true,
    });
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

      {/* OAuth result banners */}
      {oauthBanner === "success" && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <p className="text-sm font-medium text-emerald-800 flex-1">Gmail connected successfully via Google sign-in.</p>
          <button onClick={() => setOauthBanner(null)} className="text-emerald-600 hover:text-emerald-800"><X className="w-4 h-4" /></button>
        </div>
      )}
      {oauthBanner === "denied" && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-800 flex-1">Google sign-in was cancelled. You can try again below.</p>
          <button onClick={() => setOauthBanner(null)} className="text-amber-600 hover:text-amber-800"><X className="w-4 h-4" /></button>
        </div>
      )}
      {oauthBanner === "error" && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <Info className="w-4 h-4 text-destructive flex-shrink-0" />
          <p className="text-sm font-medium text-destructive flex-1">Something went wrong during Google sign-in. Please try again.</p>
          <button onClick={() => setOauthBanner(null)} className="text-destructive/60 hover:text-destructive"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Connect form or connected status */}
      {!connected ? (
        <ConnectEmailForm onConnected={() => { refetchStatus(); queryClient.invalidateQueries(); }} />
      ) : (
        <ConnectedCard email={connEmail} onDisconnect={() => { refetchStatus(); queryClient.invalidateQueries(); }} />
      )}

      {/* How syncing works — collapsible, collapsed by default when connected */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          onClick={() => setHowItWorksOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-5 py-3.5 text-left hover:bg-muted/40 transition-colors"
        >
          <Info className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="font-semibold text-foreground text-sm flex-1">How syncing works</span>
          {howItWorksOpen
            ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
        </button>
        {howItWorksOpen && (
          <div className="px-5 pb-5 grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-background p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-secondary/50 flex items-center justify-center">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-sm text-foreground">By Address</h3>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Easiest</span>
              </div>
              <p className="text-sm text-muted-foreground">Acreon scans your inbox for emails that mention the property's street address. Nothing to set up — just connect your email and hit Sync.</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Tag className="w-3.5 h-3.5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm text-foreground">By Label</h3>
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">More precise</span>
              </div>
              <p className="text-sm text-muted-foreground">
                You create a label in Gmail (like a tag) for a property and drag relevant emails there. Acreon then only pulls emails with that label — so you decide exactly what gets synced.
              </p>
            </div>
          </div>
        )}
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

      {/* Sync summary banner */}
      {syncSummary && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                {syncSummary.total === 0
                  ? "All caught up — no new emails found."
                  : `${syncSummary.total} new email${syncSummary.total !== 1 ? "s" : ""} synced across your properties.`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {syncSummary.results.some((r) => r.synced > 0) && (
                <button
                  onClick={() => setSyncSummary((s) => s ? { ...s, showNewOnly: !s.showNewOnly } : s)}
                  className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  {syncSummary.showNewOnly ? <><Eye className="w-3 h-3" /> Show all</> : <><EyeOff className="w-3 h-3" /> New only</>}
                </button>
              )}
              <button
                onClick={() => setSyncSummary(null)}
                className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {syncSummary.results.length > 0 && (
            <div className="px-4 pb-3 flex flex-col gap-1">
              {syncSummary.results
                .filter((r) => !syncSummary.showNewOnly || r.synced > 0)
                .sort((a, b) => b.synced - a.synced)
                .map((r) => (
                  <div key={r.propertyId} className="flex items-center justify-between text-xs py-1 border-t border-emerald-200/60 dark:border-emerald-800/40">
                    <span className="text-emerald-800 dark:text-emerald-300 font-medium">{r.propertyName}</span>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full font-semibold",
                      r.synced > 0
                        ? "bg-emerald-200 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {r.synced > 0 ? `+${r.synced} new` : "no new"}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

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

                    {/* Folder picker */}
                    {local.pullMode === "label" && (
                      gmailLabels.length > 0 ? (
                        <select
                          value={local.emailFolder}
                          onChange={(e) => update(prop.propertyId, { emailFolder: e.target.value }, prop)}
                          className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
                        >
                          <option value="">— pick a label —</option>
                          {gmailLabels.map((l) => (
                            <option key={l.id} value={l.name}>{l.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="Gmail label name"
                          value={local.emailFolder}
                          onChange={(e) => update(prop.propertyId, { emailFolder: e.target.value }, prop)}
                          className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
                        />
                      )
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
