import { useState, useEffect } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, ArrowLeft, Save, SkipForward, Building2,
  User, Landmark, Tag, Home, Shield, Briefcase, Lock,
  CheckCircle2,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface PropertyInfo {
  id: number;
  name: string;
  titleHolder: string | null;
  loanHolder: string | null;
  lender: string | null;
  loanType: string | null;
  hasHoa: boolean;
  hoaAmount: number | null;
  hoaName: string | null;
  insuranceCompany: string | null;
  otherInsurances: string | null;
  propertyManagementCompany: string | null;
  inTrustOrLlc: boolean;
  trustOrLlcName: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? `Enter ${label.toLowerCase()}`}
        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
      />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 sm:col-span-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

const LOAN_TYPES = ["Conventional", "FHA", "VA", "USDA", "Jumbo", "ARM", "Interest Only", "Hard Money", "Other"];

export default function PropertyInfoForm() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const isNew = new URLSearchParams(search).get("new") === "1";
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: property, isLoading } = useQuery<PropertyInfo>({
    queryKey: [`/api/properties/${id}`],
    queryFn: () => fetch(`/api/properties/${id}`).then(r => {
      if (!r.ok) throw new Error("Not found");
      return r.json();
    }),
  });

  const [form, setForm] = useState({
    titleHolder: "",
    loanHolder: "",
    lender: "",
    loanType: "",
    hasHoa: false,
    hoaAmount: "",
    hoaName: "",
    insuranceCompany: "",
    otherInsurances: "",
    propertyManagementCompany: "",
    inTrustOrLlc: false,
    trustOrLlcName: "",
  });

  // Populate from loaded property
  useEffect(() => {
    if (!property) return;
    setForm({
      titleHolder: property.titleHolder ?? "",
      loanHolder: property.loanHolder ?? "",
      lender: property.lender ?? "",
      loanType: property.loanType ?? "",
      hasHoa: property.hasHoa ?? false,
      hoaAmount: property.hoaAmount != null ? String(property.hoaAmount) : "",
      hoaName: property.hoaName ?? "",
      insuranceCompany: property.insuranceCompany ?? "",
      otherInsurances: property.otherInsurances ?? "",
      propertyManagementCompany: property.propertyManagementCompany ?? "",
      inTrustOrLlc: property.inTrustOrLlc ?? false,
      trustOrLlcName: property.trustOrLlcName ?? "",
    });
  }, [property]);

  const set = (key: keyof typeof form) => (val: string | boolean) =>
    setForm(f => ({ ...f, [key]: val }));

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/properties/${id}/property-info`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          hoaAmount: form.hoaAmount ? parseFloat(form.hoaAmount) : null,
          titleHolder: form.titleHolder || null,
          loanHolder: form.loanHolder || null,
          lender: form.lender || null,
          loanType: form.loanType || null,
          hoaName: form.hoaName || null,
          insuranceCompany: form.insuranceCompany || null,
          otherInsurances: form.otherInsurances || null,
          propertyManagementCompany: form.propertyManagementCompany || null,
          trustOrLlcName: form.trustOrLlcName || null,
        }),
      });
      if (!r.ok) throw new Error("Failed to save");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/properties/${id}`] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      toast({ title: "Saved", description: "Property info updated." });
      setLocation(`/app/properties/${id}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save. Please try again.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-64 bg-muted rounded" />
        <div className="h-96 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="text-center py-16">
        <p className="text-destructive font-medium">Property not found.</p>
        <Link href="/app/properties" className="text-sm text-primary hover:underline mt-2 block">← Back to properties</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl">
      {/* Header */}
      <div>
        <Link href={`/app/properties/${id}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="w-3.5 h-3.5" />
          {property.name}
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Property Info</h1>
            <p className="text-sm text-muted-foreground">{property.name}</p>
          </div>
        </div>
        {isNew && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Property added successfully!</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fill in the ownership and financial details below, or{" "}
                <Link href={`/app/properties/${id}`} className="text-primary hover:underline">
                  skip for now
                </Link>
                .
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Form */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-8">
        {/* Ownership */}
        <Section title="Ownership" icon={User}>
          <Field label="Name on Title" value={form.titleHolder} onChange={set("titleHolder") as (v: string) => void} placeholder="e.g. John Smith" />
          <Field label="Name on Loan" value={form.loanHolder} onChange={set("loanHolder") as (v: string) => void} placeholder="e.g. John & Jane Smith" />
        </Section>

        {/* Loan */}
        <Section title="Loan Details" icon={Landmark}>
          <Field label="Lender" value={form.lender} onChange={set("lender") as (v: string) => void} placeholder="e.g. Wells Fargo" />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Loan Type</label>
            <select
              value={form.loanType}
              onChange={e => set("loanType")(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select loan type…</option>
              {LOAN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </Section>

        {/* HOA */}
        <Section title="HOA" icon={Home}>
          <Toggle label="Has HOA?" checked={form.hasHoa} onChange={set("hasHoa") as (v: boolean) => void} />
          {form.hasHoa && (
            <>
              <Field label="HOA Name" value={form.hoaName} onChange={set("hoaName") as (v: string) => void} placeholder="e.g. Sunset Ridge HOA" />
              <Field label="Monthly HOA Amount" value={form.hoaAmount} onChange={set("hoaAmount") as (v: string) => void} placeholder="e.g. 250" type="number" />
            </>
          )}
        </Section>

        {/* Insurance */}
        <Section title="Insurance" icon={Shield}>
          <Field label="Primary Insurance Company" value={form.insuranceCompany} onChange={set("insuranceCompany") as (v: string) => void} placeholder="e.g. State Farm" />
          <Field label="Other Insurances" value={form.otherInsurances} onChange={set("otherInsurances") as (v: string) => void} placeholder="e.g. Umbrella – Allstate, Flood – NFIP" />
        </Section>

        {/* Property Management */}
        <Section title="Property Management" icon={Briefcase}>
          <div className="sm:col-span-2">
            <Field label="Property Management Company" value={form.propertyManagementCompany} onChange={set("propertyManagementCompany") as (v: string) => void} placeholder="e.g. Acme Property Management (leave blank if self-managed)" />
          </div>
        </Section>

        {/* Trust / LLC */}
        <Section title="Entity / Holding Structure" icon={Lock}>
          <Toggle label="Held in a Trust or LLC?" checked={form.inTrustOrLlc} onChange={set("inTrustOrLlc") as (v: boolean) => void} />
          {form.inTrustOrLlc && (
            <div className="sm:col-span-2">
              <Field label="Trust / LLC Name" value={form.trustOrLlcName} onChange={set("trustOrLlcName") as (v: string) => void} placeholder="e.g. Smith Family Trust or 123 Main LLC" />
            </div>
          )}
        </Section>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          {save.isPending ? "Saving…" : "Save"}
        </button>
        <Link
          href={`/app/properties/${id}`}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <SkipForward className="w-4 h-4" />
          {isNew ? "Skip for now" : "Cancel"}
        </Link>
      </div>
    </div>
  );
}
