import { useState } from "react";
import { Link } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import {
  User, Mail, Bell, ChevronRight, CheckCircle2, Loader2, Send,
  Sparkles, Eye, TrendingUp, ShieldCheck, RefreshCw, WifiOff, Wifi,
} from "lucide-react";
import {
  useGetUserPreferences,
  usePutUserPreferences,
  usePostUserDigestSend,
  usePostUserDigestPreview,
  useGetEmailStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// ── Sample digest preview (static) ───────────────────────────────────────

function SampleDigestCard() {
  return (
    <div className="rounded-xl border border-border overflow-hidden text-sm">
      {/* Email header */}
      <div className="bg-stone-900 px-5 py-4">
        <p className="text-orange-400 text-xs font-bold tracking-widest uppercase mb-1">July 2026 Update</p>
        <p className="text-white font-bold text-base">Your RealTrack Portfolio</p>
      </div>
      {/* Stats bar */}
      <div className="bg-orange-500 px-5 py-3 flex items-center gap-6">
        {[
          { label: "Properties", value: "3" },
          { label: "Total Equity", value: "$247k" },
          { label: "Avg LTV", value: "68%" },
        ].map((s) => (
          <div key={s.label}>
            <p className="text-orange-100 text-xs font-semibold uppercase tracking-wide">{s.label}</p>
            <p className="text-white font-bold text-lg leading-tight">{s.value}</p>
          </div>
        ))}
      </div>
      {/* Body */}
      <div className="p-5 space-y-4 bg-white">
        <p className="text-gray-800">Hi Alex,</p>
        <p className="text-gray-600 leading-relaxed">
          July was a solid month across your portfolio. You've now built $247k in total equity — up 4.2% from last month — and your average LTV has dropped to 68%, putting you in a healthy position across all three properties.
        </p>
        {/* Highlights */}
        <div className="rounded-lg bg-green-50 border border-green-100 p-4 space-y-3">
          <p className="font-bold text-green-800 text-xs uppercase tracking-wider">✅ Great Things Going On</p>
          <div className="pl-3 border-l-2 border-green-500 space-y-1">
            <p className="font-semibold text-green-900">Strong equity at 123 Main St</p>
            <p className="text-green-700 text-xs leading-relaxed">You've built $94k in equity — 38% of the property's current value. Appreciation is outpacing expectations.</p>
          </div>
          <div className="pl-3 border-l-2 border-green-500 space-y-1">
            <p className="font-semibold text-green-900">Oak Ave is ahead of schedule</p>
            <p className="text-green-700 text-xs leading-relaxed">Your extra payments have put you 9 months ahead on the Oak Ave mortgage, saving you an estimated $8,400 in interest.</p>
          </div>
        </div>
        {/* Watch items */}
        <div className="rounded-lg bg-amber-50 border border-amber-100 p-4 space-y-3">
          <p className="font-bold text-amber-800 text-xs uppercase tracking-wider">👁 Keep an Eye On</p>
          <div className="pl-3 border-l-2 border-amber-500 space-y-1">
            <p className="font-semibold text-amber-900">Refinance window on Maple Drive</p>
            <p className="text-amber-700 text-xs leading-relaxed">Rates have dropped 0.4% since you locked in. A 15-min call with your lender could save ~$180/month.</p>
          </div>
          <div className="pl-3 border-l-2 border-amber-500 space-y-1">
            <p className="font-semibold text-amber-900">Maple Drive LTV still above 80%</p>
            <p className="text-amber-700 text-xs leading-relaxed">At 82% LTV you'd still owe PMI on a refi. You're about 8 months away from crossing that threshold naturally.</p>
          </div>
        </div>
        <p className="text-gray-600 leading-relaxed">You're tracking well for a $310k total equity milestone by end of 2027 — keep it up.</p>
        <div className="inline-block bg-orange-500 rounded-lg px-4 py-2">
          <span className="text-white font-semibold text-sm">View My Full Portfolio →</span>
        </div>
      </div>
      <div className="bg-gray-50 border-t border-gray-100 px-5 py-3">
        <p className="text-xs text-gray-400">You're receiving this because you enabled monthly digests in RealTrack.</p>
      </div>
    </div>
  );
}

// ── Live preview card ─────────────────────────────────────────────────────

interface LivePreview {
  greeting: string;
  portfolioSummary: string;
  highlights: { title: string; description: string }[];
  watchItems: { title: string; description: string }[];
  closingLine: string;
  stats: { totalProperties: number; totalEquityFormatted: string; totalDebtFormatted: string; avgLtv: number };
}

function LivePreviewCard({ preview }: { preview: LivePreview }) {
  const month = new Date().toLocaleString("default", { month: "long", year: "numeric" });
  return (
    <div className="rounded-xl border border-primary/30 overflow-hidden text-sm ring-1 ring-primary/10">
      <div className="bg-stone-900 px-5 py-4">
        <p className="text-orange-400 text-xs font-bold tracking-widest uppercase mb-1">{month} Update</p>
        <p className="text-white font-bold text-base">Your RealTrack Portfolio</p>
      </div>
      <div className="bg-orange-500 px-5 py-3 flex items-center gap-6">
        {[
          { label: "Properties", value: String(preview.stats.totalProperties) },
          { label: "Total Equity", value: preview.stats.totalEquityFormatted },
          { label: "Avg LTV", value: `${preview.stats.avgLtv}%` },
        ].map((s) => (
          <div key={s.label}>
            <p className="text-orange-100 text-xs font-semibold uppercase tracking-wide">{s.label}</p>
            <p className="text-white font-bold text-lg leading-tight">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="p-5 space-y-4 bg-white">
        <p className="text-gray-800">{preview.greeting}</p>
        <p className="text-gray-600 leading-relaxed">{preview.portfolioSummary}</p>
        {preview.highlights.length > 0 && (
          <div className="rounded-lg bg-green-50 border border-green-100 p-4 space-y-3">
            <p className="font-bold text-green-800 text-xs uppercase tracking-wider">✅ Great Things Going On</p>
            {preview.highlights.map((h, i) => (
              <div key={i} className="pl-3 border-l-2 border-green-500 space-y-1">
                <p className="font-semibold text-green-900">{h.title}</p>
                <p className="text-green-700 text-xs leading-relaxed">{h.description}</p>
              </div>
            ))}
          </div>
        )}
        {preview.watchItems.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-100 p-4 space-y-3">
            <p className="font-bold text-amber-800 text-xs uppercase tracking-wider">👁 Keep an Eye On</p>
            {preview.watchItems.map((w, i) => (
              <div key={i} className="pl-3 border-l-2 border-amber-500 space-y-1">
                <p className="font-semibold text-amber-900">{w.title}</p>
                <p className="text-amber-700 text-xs leading-relaxed">{w.description}</p>
              </div>
            ))}
          </div>
        )}
        <p className="text-gray-600 leading-relaxed">{preview.closingLine}</p>
        <div className="inline-block bg-orange-500 rounded-lg px-4 py-2">
          <span className="text-white font-semibold text-sm">View My Full Portfolio →</span>
        </div>
      </div>
      <div className="bg-gray-50 border-t border-gray-100 px-5 py-3">
        <p className="text-xs text-gray-400">You're receiving this because you enabled monthly digests in RealTrack.</p>
      </div>
    </div>
  );
}

// ── Main settings page ────────────────────────────────────────────────────

export default function Settings() {
  const { user } = useUser();
  const { openUserProfile } = useClerk();
  const queryClient = useQueryClient();

  const { data: prefs, isLoading: prefsLoading } = useGetUserPreferences();
  const { data: emailStatus } = useGetEmailStatus();
  const prefsMutation = usePutUserPreferences();
  const sendMutation = usePostUserDigestSend();
  const previewMutation = usePostUserDigestPreview();

  const [livePreview, setLivePreview] = useState<LivePreview | null>(null);
  const [showSample, setShowSample] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const enabled = prefs?.monthlyDigestEnabled ?? false;

  const handleToggle = async () => {
    await prefsMutation.mutateAsync({ data: { monthlyDigestEnabled: !enabled } });
    queryClient.invalidateQueries({ queryKey: ["/api/user/preferences"] });
  };

  const handleSendTest = async () => {
    setSendSuccess(null);
    setSendError(null);
    try {
      const result = await sendMutation.mutateAsync();
      setSendSuccess(`Sent to ${(result as { sentTo?: string }).sentTo ?? "your email"}`);
      queryClient.invalidateQueries({ queryKey: ["/api/user/preferences"] });
    } catch (err: unknown) {
      setSendError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Failed to send — check that your email account is connected."
      );
    }
  };

  const handlePreview = async () => {
    setLivePreview(null);
    const result = await previewMutation.mutateAsync();
    setLivePreview(result as LivePreview);
  };

  const primaryEmail = user?.primaryEmailAddress?.emailAddress;

  return (
    <div className="space-y-8 max-w-2xl animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">Manage your account and notification preferences.</p>
      </div>

      {/* ── Account ────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Account</h2>
        </div>
        <div className="p-5 space-y-4">
          {user ? (
            <div className="flex items-center gap-4">
              {user.imageUrl && (
                <img src={user.imageUrl} alt="Avatar" className="w-12 h-12 rounded-full object-cover border border-border" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">
                  {user.firstName ?? ""} {user.lastName ?? ""}
                  {!user.firstName && !user.lastName && <span className="text-muted-foreground">No name set</span>}
                </p>
                <p className="text-sm text-muted-foreground truncate">{primaryEmail ?? "No email"}</p>
              </div>
              <button
                onClick={() => openUserProfile()}
                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Manage <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="h-12 bg-muted rounded-lg animate-pulse" />
          )}

          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
            <span>
              Username, password, connected social accounts, and two-factor authentication are managed via the{" "}
              <button onClick={() => openUserProfile()} className="underline hover:text-foreground transition-colors">
                account settings panel
              </button>.
            </span>
          </div>
        </div>
      </section>

      {/* ── Connected Email ─────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Email for Communications</h2>
        </div>
        <div className="p-5">
          {emailStatus?.connected ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Wifi className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">{emailStatus.email}</p>
                <p className="text-xs text-muted-foreground">Connected via IMAP — used to sync property communications</p>
              </div>
              <Link href="/app/communications" className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors font-medium">
                Manage <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <WifiOff className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-muted-foreground">No email connected</p>
                <p className="text-xs text-muted-foreground">Connect your inbox to sync property-related emails</p>
              </div>
              <Link href="/app/communications" className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors font-medium">
                Connect <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── Monthly Digest ──────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Monthly Portfolio Digest</h2>
        </div>
        <div className="p-5 space-y-5">
          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            Once a month, RealTrack's AI reviews your portfolio and sends you a personalised summary — equity progress, highlights, and anything worth your attention — straight to{" "}
            <span className="font-medium text-foreground">{primaryEmail ?? "your account email"}</span>.
          </p>

          {/* What's included */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: TrendingUp, label: "Portfolio overview & equity stats" },
              { icon: CheckCircle2, label: "2 highlights — what's working well" },
              { icon: Eye, label: "2 watch items — things to act on" },
              { icon: Sparkles, label: "AI insights from your communications" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                {label}
              </div>
            ))}
          </div>

          {/* Toggle row */}
          <div className="flex items-center justify-between py-3 border-t border-border">
            <div>
              <p className="font-medium text-foreground text-sm">Send me monthly digests</p>
              {prefs?.lastDigestSentAt ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last sent {new Date(prefs.lastDigestSentAt).toLocaleDateString("default", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">Sent on the 1st of each month</p>
              )}
            </div>
            {prefsLoading ? (
              <div className="w-11 h-6 bg-muted rounded-full animate-pulse" />
            ) : (
              <button
                onClick={handleToggle}
                disabled={prefsMutation.isPending}
                className={cn(
                  "relative inline-flex w-11 h-6 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  enabled ? "bg-primary" : "bg-muted-foreground/30"
                )}
              >
                <span
                  className={cn(
                    "inline-block w-4 h-4 transform rounded-full bg-white shadow-sm transition-transform",
                    enabled ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSendTest}
              disabled={sendMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background hover:bg-muted text-sm font-medium text-foreground transition-colors disabled:opacity-50"
            >
              {sendMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
              ) : (
                <><Send className="w-4 h-4" /> Send Test Email</>
              )}
            </button>

            <button
              onClick={handlePreview}
              disabled={previewMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background hover:bg-muted text-sm font-medium text-foreground transition-colors disabled:opacity-50"
            >
              {previewMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              ) : (
                <><RefreshCw className="w-4 h-4" /> Generate Live Preview</>
              )}
            </button>

            <button
              onClick={() => { setShowSample((v) => !v); setLivePreview(null); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background hover:bg-muted text-sm font-medium text-foreground transition-colors"
            >
              <Eye className="w-4 h-4" /> {showSample ? "Hide Sample" : "Show Sample"}
            </button>
          </div>

          {/* Status messages */}
          {sendSuccess && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <p className="text-sm text-emerald-700">{sendSuccess}</p>
            </div>
          )}
          {sendError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <p className="text-sm text-destructive">{sendError}</p>
            </div>
          )}

          {/* Preview area */}
          {livePreview && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Live preview — generated from your actual portfolio
              </p>
              <LivePreviewCard preview={livePreview} />
            </div>
          )}
          {showSample && !livePreview && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Sample — showing example data</p>
              <SampleDigestCard />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
