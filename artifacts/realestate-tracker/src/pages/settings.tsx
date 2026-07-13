import { useState } from "react";
import { Link } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import {
  User, Mail, Bell, ChevronRight, CheckCircle2, Loader2, Send,
  Sparkles, Eye, TrendingUp, ShieldCheck, RefreshCw, WifiOff, Wifi, MessageSquare,
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
        <p className="text-white font-bold text-base">Your Acreon Portfolio</p>
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
        <p className="text-xs text-gray-400">You're receiving this because you enabled monthly digests in Acreon.</p>
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
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Feedback state
  const [feedbackCategory, setFeedbackCategory] = useState("general");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const handleSendFeedback = async () => {
    if (!feedbackMessage.trim()) return;
    setFeedbackSending(true);
    setFeedbackError(null);
    setFeedbackSuccess(false);
    try {
      const res = await fetch("/api/user/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: feedbackCategory, message: feedbackMessage.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setFeedbackSuccess(true);
      setFeedbackMessage("");
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "Failed to send feedback");
    } finally {
      setFeedbackSending(false);
    }
  };

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
            Once a month, Acreon's AI reviews your portfolio and sends you a personalised summary — equity progress, highlights, and anything worth your attention — straight to{" "}
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
        </div>
      </section>

      {/* ── Feedback ────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Send Feedback</h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Have a suggestion, found a bug, or just want to share how things are going? Send it directly — we read every message.
          </p>

          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            {[
              { value: "general", label: "General" },
              { value: "bug", label: "🐛 Bug report" },
              { value: "feature", label: "✨ Feature idea" },
              { value: "question", label: "❓ Question" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFeedbackCategory(opt.value)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  feedbackCategory === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Message */}
          <textarea
            value={feedbackMessage}
            onChange={(e) => { setFeedbackMessage(e.target.value); setFeedbackSuccess(false); }}
            placeholder="What's on your mind?"
            rows={4}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />

          <div className="flex items-center gap-3">
            <button
              onClick={handleSendFeedback}
              disabled={feedbackSending || !feedbackMessage.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {feedbackSending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
              ) : (
                <><Send className="w-4 h-4" /> Send Feedback</>
              )}
            </button>
            {feedbackSuccess && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                <CheckCircle2 className="w-4 h-4" /> Sent — thanks!
              </span>
            )}
            {feedbackError && (
              <span className="text-sm text-destructive">{feedbackError}</span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
