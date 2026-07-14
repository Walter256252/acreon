import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Building2, Pencil, CheckCircle, Filter } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface Property {
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

function Cell({ value, fallback = "—" }: { value: string | null | undefined; fallback?: string }) {
  if (!value) return <span className="text-muted-foreground/50 italic text-xs">{fallback}</span>;
  return <span className="text-sm text-foreground">{value}</span>;
}

function BoolCell({ value, label, sub }: { value: boolean; label?: string; sub?: string | null }) {
  if (!value) return <span className="text-muted-foreground/50 italic text-xs">No</span>;
  return (
    <div className="flex items-start gap-1.5">
      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
      <div>
        <span className="text-sm text-foreground font-medium">{label ?? "Yes"}</span>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ── Column definitions ─────────────────────────────────────────────────────
// hasValue: returns true when this property has a meaningful value for the column
// (used to determine whether a row passes the active filter)

const COLUMNS: Array<{
  key: string;
  label: string;
  width?: string;
  sticky?: boolean;
  filterable?: boolean;
  hasValue: (p: Property) => boolean;
  render: (p: Property) => React.ReactNode;
}> = [
  {
    key: "property",
    label: "Property",
    width: "min-w-[160px]",
    sticky: true,
    filterable: false,
    hasValue: () => true,
    render: p => (
      <Link href={`/app/properties/${p.id}`}>
        <span className="font-semibold text-foreground hover:text-primary transition-colors cursor-pointer">
          {p.name}
        </span>
      </Link>
    ),
  },
  {
    key: "titleHolder",
    label: "Title Holder",
    width: "min-w-[140px]",
    filterable: true,
    hasValue: p => !!p.titleHolder,
    render: p => <Cell value={p.titleHolder} />,
  },
  {
    key: "loanHolder",
    label: "Loan Holder",
    width: "min-w-[140px]",
    filterable: true,
    hasValue: p => !!p.loanHolder,
    render: p => <Cell value={p.loanHolder} />,
  },
  {
    key: "lender",
    label: "Lender",
    width: "min-w-[130px]",
    filterable: true,
    hasValue: p => !!p.lender,
    render: p => <Cell value={p.lender} />,
  },
  {
    key: "loanType",
    label: "Loan Type",
    width: "min-w-[110px]",
    filterable: true,
    hasValue: p => !!p.loanType,
    render: p => p.loanType
      ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">{p.loanType}</span>
      : <span className="text-muted-foreground/50 italic text-xs">—</span>,
  },
  {
    key: "hoa",
    label: "HOA",
    width: "min-w-[160px]",
    filterable: true,
    hasValue: p => p.hasHoa,
    render: p => p.hasHoa
      ? <BoolCell
          value
          label={p.hoaName ?? "Yes"}
          sub={p.hoaAmount != null ? `$${Number(p.hoaAmount).toLocaleString()}/mo` : undefined}
        />
      : <span className="text-muted-foreground/50 italic text-xs">No</span>,
  },
  {
    key: "insurance",
    label: "Insurance",
    width: "min-w-[140px]",
    filterable: true,
    hasValue: p => !!p.insuranceCompany,
    render: p => <Cell value={p.insuranceCompany} />,
  },
  {
    key: "otherInsurances",
    label: "Other Insurances",
    width: "min-w-[160px]",
    filterable: true,
    hasValue: p => !!p.otherInsurances,
    render: p => <Cell value={p.otherInsurances} />,
  },
  {
    key: "mgmt",
    label: "Property Mgmt",
    width: "min-w-[160px]",
    filterable: true,
    hasValue: p => !!p.propertyManagementCompany,
    render: p => <Cell value={p.propertyManagementCompany} fallback="Self-managed" />,
  },
  {
    key: "entity",
    label: "Trust / LLC",
    width: "min-w-[160px]",
    filterable: true,
    hasValue: p => p.inTrustOrLlc,
    render: p => p.inTrustOrLlc
      ? <BoolCell value label={p.trustOrLlcName ?? "Yes"} />
      : <span className="text-muted-foreground/50 italic text-xs">No</span>,
  },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function PropertyInfoTab() {
  const { data: properties = [], isLoading } = useQuery<Property[]>({
    queryKey: ["properties"],
    queryFn: () => fetch("/api/properties").then(r => {
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    }),
  });

  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  function toggleFilter(key: string) {
    setActiveFilter(prev => (prev === key ? null : key));
  }

  const activeCol = activeFilter ? COLUMNS.find(c => c.key === activeFilter) : null;
  const visibleProperties = activeCol
    ? properties.filter(p => activeCol.hasValue(p))
    : properties;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <FileText className="w-7 h-7 text-primary" />
          Property Info
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Ownership, loan, HOA, insurance, management, and entity details for every property.
        </p>
      </div>

      {/* Active filter badge */}
      {activeFilter && (
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{visibleProperties.length}</span> of{" "}
            {properties.length} properties with{" "}
            <span className="font-semibold text-primary">{activeCol?.label}</span> filled in
          </span>
          <button
            onClick={() => setActiveFilter(null)}
            className="ml-1 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : properties.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <Building2 className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="font-medium text-foreground mb-1">No properties yet</p>
          <p className="text-sm text-muted-foreground mb-4">Add your first property to start tracking details.</p>
          <Link href="/app/properties/new">
            <button className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              Add Property
            </button>
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      className={cn(
                        "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap border-b border-border",
                        col.width,
                        col.sticky && "sticky left-0 z-20 bg-muted/40",
                        col.filterable
                          ? "cursor-pointer select-none group"
                          : "text-muted-foreground",
                        col.filterable && activeFilter === col.key
                          ? "text-primary"
                          : col.filterable
                          ? "text-muted-foreground hover:text-foreground"
                          : "",
                        // right shadow on the sticky column
                        col.sticky && "after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border after:content-['']",
                        col.sticky && "relative"
                      )}
                      onClick={col.filterable ? () => toggleFilter(col.key) : undefined}
                      title={col.filterable ? `Filter: show only properties with ${col.label}` : undefined}
                    >
                      <span className="flex items-center gap-1.5">
                        {col.label}
                        {col.filterable && (
                          <Filter
                            className={cn(
                              "w-3 h-3 transition-opacity",
                              activeFilter === col.key
                                ? "opacity-100 text-primary"
                                : "opacity-0 group-hover:opacity-60"
                            )}
                          />
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap border-b border-border">
                    Edit
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleProperties.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLUMNS.length + 1}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      No properties match this filter.
                    </td>
                  </tr>
                ) : (
                  visibleProperties.map(p => (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                      {COLUMNS.map((col, i) => (
                        <td
                          key={col.key}
                          className={cn(
                            "px-4 py-4 align-top",
                            col.sticky && "sticky left-0 z-10 bg-card relative",
                            col.sticky && "after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border after:content-['']",
                            // highlight column when it's the active filter
                            activeFilter === col.key && "bg-primary/5"
                          )}
                        >
                          {col.render(p)}
                        </td>
                      ))}
                      <td className="px-4 py-4 text-right align-top">
                        <Link href={`/app/properties/${p.id}/property-info`}>
                          <button
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                            title="Edit property info"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer hint */}
          <div className="px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            Click any <strong>column header</strong> to filter by that category. Click <strong>Edit</strong> to update a property's details.
          </div>
        </div>
      )}
    </div>
  );
}
