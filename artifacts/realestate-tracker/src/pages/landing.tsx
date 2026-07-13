import { Link } from "wouter";
import {
  TrendingUp,
  Calculator,
  BrainCircuit,
  ChevronRight,
  BarChart3,
  ShieldCheck,
  Zap,
  MapPin,
  DollarSign,
  FileBarChart,
  Users,
  Repeat,
  Building2,
  FileText,
  Sparkles,
  FolderOpen,
  Home,
} from "lucide-react";

// ── Feature groups ────────────────────────────────────────────────────────

const FEATURE_GROUPS = [
  {
    tag: "Portfolio Intelligence",
    headline: "See your whole portfolio — now and 30 years from now",
    description:
      "Acreon keeps a live picture of every property's equity, debt, and cash performance. Run projections, model scenarios, and know exactly where you stand.",
    features: [
      {
        icon: BarChart3,
        title: "Amortization schedules",
        description:
          "Full payment-by-payment breakdowns for every property. Current payment auto-highlighted. Toggle all payments or current-and-forward.",
      },
      {
        icon: TrendingUp,
        title: "30-year equity projections",
        description:
          "Chart your portfolio's equity, debt paydown, and cumulative interest at 5, 10, 15, 20, and 30-year milestones across every property.",
      },
      {
        icon: Calculator,
        title: "What-if scenario calculator",
        description:
          "Change a rate, term, or extra-payment amount on any property and watch the amortization table and projections recalculate instantly.",
      },
      {
        icon: Building2,
        title: "Portfolio dashboard",
        description:
          "Spotlights for HOA exposure, entity/trust holdings, managed properties, and properties with incomplete info — all auto-computed from your data.",
      },
    ],
  },
  {
    tag: "Finances",
    headline: "Track every dollar in and out — without the spreadsheet",
    description:
      "Log income, expenses, loan payments, and capital improvements. Generate a clean CPA-ready report at tax time. The AI does the filing for you.",
    features: [
      {
        icon: Sparkles,
        title: "AI Quick Add",
        description:
          "Type a transaction in plain English — \"$1,200 rent from unit 2A\" — and the AI parses the amount, type, category, and property for you to review and save.",
      },
      {
        icon: Repeat,
        title: "Recurring payments",
        description:
          "Mark any transaction as recurring — monthly, quarterly, semi-annual, or annual. The AI detects recurring language automatically and pre-toggles it.",
      },
      {
        icon: DollarSign,
        title: "NOI & cash flow overview",
        description:
          "Gross income, operating expenses, NOI, mortgage payments, and cash flow — all computed correctly, broken down by property or across your whole portfolio.",
      },
      {
        icon: FileBarChart,
        title: "CPA-ready report",
        description:
          "Export a clean CSV of your full transaction history by tax year, categorized and labeled so your accountant can import it directly.",
      },
    ],
  },
  {
    tag: "Property Details",
    headline: "Everything about each property in one place",
    description:
      "Beyond the numbers — track who holds the title, which lender has the loan, HOA details, insurance, property managers, and entity structure.",
    features: [
      {
        icon: MapPin,
        title: "Interactive map view",
        description:
          "See all your properties plotted on a map. Geocoded automatically from addresses. Switch between a simple list and detailed property cards.",
      },
      {
        icon: Users,
        title: "Occupancy & tenant tracking",
        description:
          "Record lease start/end dates, tenant details, and rental type per unit. See occupancy status at a glance across your whole portfolio.",
      },
      {
        icon: FileText,
        title: "Ownership & loan details",
        description:
          "Store the title holder, lender, loan type, HOA, insurance carrier, property manager, and trust or LLC name for every property.",
      },
      {
        icon: FolderOpen,
        title: "Receipt folder links",
        description:
          "Link a Google Drive or Dropbox folder to each property for storing receipts. Accessible in one click from the Finances overview.",
      },
    ],
  },
  {
    tag: "AI Assistant",
    headline: "Ask anything — the AI knows your portfolio",
    description:
      "One AI that has context on every property, balance, payment schedule, tenant, and transaction you've entered. No generic answers.",
    features: [
      {
        icon: BrainCircuit,
        title: "Portfolio-aware conversations",
        description:
          "Ask \"Which property has the best cash flow this year?\" or \"How much equity do I have across all my properties?\" and get a specific, data-backed answer.",
      },
      {
        icon: Sparkles,
        title: "Natural-language transaction entry",
        description:
          "Describe income or expenses in plain English — the AI classifies them, assigns the right property, and flags anything it's unsure about for your review.",
      },
    ],
  },
];

const STATS = [
  { value: "30yr", label: "Projection horizon" },
  { value: "AI", label: "Quick-add transactions" },
  { value: "Map", label: "Portfolio view" },
  { value: "CPA", label: "Export-ready reports" },
];

// ── Component ─────────────────────────────────────────────────────────────

export default function Landing() {
  const green = "hsl(150,48%,34%)";

  return (
    <div className="min-h-screen bg-[hsl(120,6%,97%)] text-[hsl(160,12%,12%)] font-sans">

      {/* Nav */}
      <header className="border-b border-[hsl(120,8%,85%)] bg-[hsl(120,6%,97%)]/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-bold text-xl tracking-tight">
            <img src="/logo-symbol.svg" alt="Acreon" className="w-7 h-7 flex-shrink-0" />
            Acreon
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-[hsl(160,8%,42%)] hover:text-[hsl(160,12%,12%)] transition-colors px-3 py-2 cursor-pointer"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm font-semibold bg-[hsl(150,48%,34%)] text-white px-4 py-2 rounded-md hover:bg-[hsl(150,48%,28%)] transition-colors cursor-pointer"
            >
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
          Everything about your portfolio —{" "}
          <span className="text-[hsl(150,48%,34%)]">in one place</span>
        </h1>

        <p className="text-lg text-[hsl(160,8%,42%)] max-w-2xl mx-auto mb-10 leading-relaxed">
          Acreon gives real estate investors a unified view of equity, finances, occupancy,
          and long-term projections across every property — with an AI assistant that knows
          your data and can file transactions for you.
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

      {/* Feature groups */}
      {FEATURE_GROUPS.map((group, gi) => (
        <section
          key={group.tag}
          className={gi % 2 === 1 ? "bg-white" : "bg-[hsl(120,6%,97%)]"}
        >
          <div className="max-w-6xl mx-auto px-6 py-20">
            {/* Group header */}
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-1.5 text-[hsl(150,48%,30%)] text-xs font-bold uppercase tracking-widest mb-4 bg-[hsl(150,48%,34%)]/10 px-3 py-1.5 rounded-full border border-[hsl(150,48%,34%)]/20">
                {group.tag}
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 max-w-2xl mx-auto">
                {group.headline}
              </h2>
              <p className="text-[hsl(160,8%,42%)] max-w-xl mx-auto leading-relaxed">
                {group.description}
              </p>
            </div>

            {/* Feature cards */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-5 ${group.features.length === 2 ? "max-w-3xl mx-auto" : ""}`}>
              {group.features.map((f) => (
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
          </div>
        </section>
      ))}

      {/* Full feature list strip */}
      <section className="border-y border-[hsl(120,8%,85%)] bg-[hsl(160,18%,10%)] text-white">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-extrabold tracking-tight mb-10 text-center">
            Everything included, no add-ons
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-10 gap-y-4">
            {[
              "Amortization schedules with current-payment highlight",
              "30-year equity & debt projections",
              "What-if scenario calculator per property",
              "Portfolio dashboard with spotlight cards",
              "Income, expense, and loan payment tracking",
              "AI Quick Add — plain-English transaction entry",
              "Recurring payment detection & bulk save",
              "Net operating income & cash flow summary",
              "CPA-ready CSV export by tax year",
              "Interactive map view of all properties",
              "Occupancy & tenant tracking",
              "Ownership, lender & HOA detail records",
              "Trust / LLC entity tracking",
              "Insurance & property manager records",
              "Receipt folder links per property",
              "AI portfolio assistant with full data context",
              "Property-by-property financial breakdown",
              "Date-range and property filters everywhere",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2.5 text-sm">
                <div className="mt-0.5 w-4 h-4 rounded-full bg-[hsl(150,48%,34%)]/30 flex items-center justify-center shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-[hsl(150,45%,55%)]" />
                </div>
                <span className="text-[hsl(120,10%,78%)]">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="rounded-2xl bg-[hsl(150,48%,34%)] text-white px-10 py-16 text-center">
          <Home className="w-9 h-9 text-white/60 mx-auto mb-5" />
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            Ready to take control of your portfolio?
          </h2>
          <p className="text-white/70 mb-9 max-w-md mx-auto leading-relaxed text-base">
            Add your properties, track your finances, and ask the AI anything.
            Free to start — no credit card needed.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 bg-white text-[hsl(150,48%,28%)] font-bold px-8 py-3.5 rounded-md hover:bg-white/90 transition-colors cursor-pointer shadow-sm text-base"
            >
              Create free account
              <ChevronRight className="w-4 h-4" />
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 text-white font-semibold px-8 py-3.5 rounded-md border border-white/30 hover:bg-white/10 transition-colors cursor-pointer text-base"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[hsl(120,8%,85%)] py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <img src="/logo-symbol.svg" alt="Acreon" className="w-6 h-6 flex-shrink-0" />
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
