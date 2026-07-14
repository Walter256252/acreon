import { useState } from "react";
import { useUser } from "@clerk/react";
import {
  LayoutDashboard, Wallet, Building2, TrendingUp, Sparkles, X, ChevronRight, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tour slides ────────────────────────────────────────────────────────────

const SLIDES = [
  {
    icon: <LayoutDashboard className="w-10 h-10 text-primary" />,
    color: "bg-primary/10",
    title: "Portfolio Dashboard",
    description:
      "Your home base. See every property's current value, equity, loan balance, and overall portfolio health — all in one place.",
  },
  {
    icon: <Building2 className="w-10 h-10 text-violet-500" />,
    color: "bg-violet-500/10",
    title: "Properties",
    description:
      "Add each property you own. Track purchase price, current value, loan details, and watch equity grow over time as you update values.",
  },
  {
    icon: <Wallet className="w-10 h-10 text-emerald-600" />,
    color: "bg-emerald-500/10",
    title: "Finances",
    description:
      "Log rent income, expenses, and mortgage payments. The AI Quick Add lets you describe a transaction and it does the rest.",
  },
  {
    icon: <TrendingUp className="w-10 h-10 text-amber-500" />,
    color: "bg-amber-500/10",
    title: "Projections",
    description:
      "Model how your equity and loan balances grow over the next 30 years. Adjust assumptions to stress-test your portfolio.",
  },
  {
    icon: <Sparkles className="w-10 h-10 text-rose-500" />,
    color: "bg-rose-500/10",
    title: "AI Assistant",
    description:
      "Ask anything about your portfolio — equity across properties, top performers, cash flow trends. It knows your data and gives real answers.",
  },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function WelcomeTour() {
  const { user, isLoaded } = useUser();
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Only show after onboarding is done and tour hasn't been seen yet
  const shouldShow =
    isLoaded &&
    user &&
    !!user.unsafeMetadata?.onboardingComplete &&
    !user.unsafeMetadata?.tourComplete &&
    !dismissed;

  if (!shouldShow) return null;

  async function markDone() {
    setDismissed(true);
    try {
      await user!.update({
        unsafeMetadata: {
          ...(user!.unsafeMetadata as Record<string, unknown>),
          tourComplete: true,
        },
      });
    } catch {
      // Best-effort — if it fails, localStorage fallback via dismissed state
    }
  }

  const isLast = step === SLIDES.length - 1;
  const slide = SLIDES[step];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm"
        onClick={markDone}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md bg-background rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-0">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Quick tour — {step + 1} of {SLIDES.length}
            </span>
            <button
              onClick={markDone}
              className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Slide content */}
          <div className="px-5 py-6 space-y-4">
            {/* Icon */}
            <div className={cn("w-20 h-20 rounded-2xl flex items-center justify-center mx-auto", slide.color)}>
              {slide.icon}
            </div>

            {/* Text */}
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-foreground">{slide.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{slide.description}</p>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 pb-4">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={cn(
                  "rounded-full transition-all",
                  i === step
                    ? "w-5 h-2 bg-primary"
                    : "w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
              />
            ))}
          </div>

          {/* Footer actions */}
          <div className="px-5 pb-5 flex items-center justify-between gap-3">
            <button
              onClick={markDone}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip tour
            </button>

            <button
              onClick={() => (isLast ? markDone() : setStep(s => s + 1))}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              {isLast ? (
                <>
                  <Check className="w-4 h-4" /> Get started
                </>
              ) : (
                <>
                  Next <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
