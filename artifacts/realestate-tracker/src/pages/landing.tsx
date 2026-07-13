import { Link } from "wouter";
import { TrendingUp, Calculator, BrainCircuit, ChevronRight, BarChart3, ShieldCheck, Zap } from "lucide-react";

const FEATURES = [
  {
    icon: BarChart3,
    title: "Amortization at a glance",
    description:
      "Full payment-by-payment schedules for every property. Toggle between all payments or current-and-forward. The current payment is always highlighted automatically.",
  },
  {
    icon: TrendingUp,
    title: "30-year projections",
    description:
      "See your portfolio's equity, debt, and interest costs at 5, 10, 15, 20, and 30 year milestones — charted and broken down per property.",
  },
  {
    icon: Calculator,
    title: "What-if scenario calculator",
    description:
      "Inline scenario tool on every property. Change the rate, term, or extra payments and instantly see how it reshapes your amortization schedule.",
  },
  {
    icon: BrainCircuit,
    title: "AI portfolio assistant",
    description:
      "Ask anything about your portfolio in plain English. The AI knows every property, balance, and payment schedule — so answers are specific to your data.",
  },
];

const STATS = [
  { value: "30yr", label: "Projection horizon" },
  { value: "5", label: "Milestone snapshots" },
  { value: "Real-time", label: "Amortization math" },
  { value: "AI", label: "Portfolio insights" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[hsl(120,6%,97%)] text-[hsl(160,12%,12%)] font-sans">

      {/* Nav */}
      <header className="border-b border-[hsl(120,8%,85%)] bg-[hsl(120,6%,97%)]/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-bold text-xl tracking-tight">
            <img src="/logo.png" alt="Acreon" className="w-7 h-7 object-contain" />
            Acreon
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-sm font-medium text-[hsl(160,8%,42%)] hover:text-[hsl(160,12%,12%)] transition-colors px-3 py-2 cursor-pointer">
              Sign in
            </Link>
            <Link href="/sign-up" className="text-sm font-semibold bg-[hsl(150,48%,34%)] text-white px-4 py-2 rounded-md hover:bg-[hsl(150,48%,28%)] transition-colors cursor-pointer">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 bg-[hsl(150,48%,34%)]/10 text-[hsl(150,48%,30%)] text-xs font-semibold px-3 py-1.5 rounded-full mb-8 border border-[hsl(150,48%,34%)]/20">
          <Zap className="w-3 h-3" />
          Real estate portfolio intelligence
        </div>

        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-tight mb-6 max-w-3xl mx-auto">
          Know exactly where your{" "}
          <span className="text-[hsl(150,48%,34%)]">portfolio stands</span>
          {" "}— today and in 30 years
        </h1>

        <p className="text-lg text-[hsl(160,8%,42%)] max-w-2xl mx-auto mb-10 leading-relaxed">
          Acreon gives real estate investors a clear view of equity, amortization,
          and long-term projections across every property — with an AI assistant that
          knows your data.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 bg-[hsl(150,48%,34%)] text-white font-semibold px-7 py-3.5 rounded-md hover:bg-[hsl(150,48%,28%)] transition-colors text-base cursor-pointer shadow-sm"
          >
            Create free account
            <ChevronRight className="w-4 h-4" />
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 text-[hsl(160,12%,12%)] font-semibold px-7 py-3.5 rounded-md border border-[hsl(120,8%,85%)] hover:border-[hsl(120,8%,72%)] hover:bg-[hsl(120,6%,94%)] transition-colors text-base cursor-pointer"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-[hsl(120,8%,85%)] bg-white">
        <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-extrabold text-[hsl(150,48%,34%)] tracking-tight">{s.value}</p>
              <p className="text-sm text-[hsl(160,8%,42%)] mt-1 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            Everything your portfolio needs
          </h2>
          <p className="text-[hsl(160,8%,42%)] max-w-xl mx-auto">
            Built for investors who want numbers, not guesswork.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-[hsl(120,8%,85%)] bg-white p-7 hover:border-[hsl(150,48%,34%)]/30 hover:shadow-sm transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-[hsl(150,48%,34%)]/10 flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-[hsl(150,48%,34%)]" />
              </div>
              <h3 className="font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-[hsl(160,8%,42%)] text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="rounded-2xl bg-[hsl(160,18%,10%)] text-white px-10 py-14 text-center">
          <ShieldCheck className="w-8 h-8 text-[hsl(150,45%,46%)] mx-auto mb-5" />
          <h2 className="text-3xl font-extrabold tracking-tight mb-3">
            Ready to take control?
          </h2>
          <p className="text-[hsl(120,10%,70%)] mb-8 max-w-md mx-auto">
            Add your properties, pull up the numbers, and ask the AI anything. Free to start, no credit card needed.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 bg-[hsl(150,48%,34%)] text-white font-semibold px-8 py-3.5 rounded-md hover:bg-[hsl(150,48%,28%)] transition-colors cursor-pointer"
          >
            Join Acreon
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[hsl(120,8%,85%)] py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <img src="/logo.png" alt="Acreon" className="w-5 h-5 object-contain" />
            Acreon
          </div>
          <p className="text-xs text-[hsl(160,8%,52%)]">
            Real estate portfolio tracker. Built for investors.
          </p>
        </div>
      </footer>
    </div>
  );
}
