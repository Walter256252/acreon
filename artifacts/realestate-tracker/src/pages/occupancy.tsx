import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Home, Building2, ChevronLeft, ChevronRight, CalendarDays, BedDouble } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────
type RentalType = "long-term" | "short-term" | null;
interface OccupancyRecord { period: string; occupied: boolean; nights: number | null; }
interface PropertyOccupancy {
  id: number;
  name: string;
  address: string;
  rentalType: RentalType;
  monthlyRent: number | null;
  occupancyRecords: OccupancyRecord[];
}

// ── API helpers ────────────────────────────────────────────────────────────
async function fetchOccupancy(): Promise<PropertyOccupancy[]> {
  const r = await fetch("/api/occupancy");
  if (!r.ok) throw new Error("Failed to load occupancy");
  return r.json();
}

async function saveRecord(body: { propertyId: number; period: string; occupied: boolean; nights?: number | null }) {
  const r = await fetch("/api/occupancy/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Failed to save");
}

async function updateRentalType(id: number, rentalType: RentalType) {
  const r = await fetch(`/api/properties/${id}/rental-type`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rentalType }),
  });
  if (!r.ok) throw new Error("Failed to update rental type");
}

// ── Month grid (LTR) ──────────────────────────────────────────────────────
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function LongTermGrid({ property, year }: { property: PropertyOccupancy; year: number }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (vars: { period: string; occupied: boolean }) =>
      saveRecord({ propertyId: property.id, ...vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["occupancy"] }),
  });

  const occupiedSet = new Set(
    property.occupancyRecords
      .filter((r) => r.occupied && r.period.startsWith(`${year}-`))
      .map((r) => r.period)
  );

  const occupiedCount = occupiedSet.size;
  const pct = Math.round((occupiedCount / 12) * 100);

  const toggle = (monthIdx: number) => {
    const period = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
    mutation.mutate({ period, occupied: !occupiedSet.has(period) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{occupiedCount}/12</span> months occupied
        </p>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-28 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-medium text-foreground">{pct}%</span>
        </div>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5">
        {MONTHS.map((label, i) => {
          const period = `${year}-${String(i + 1).padStart(2, "0")}`;
          const checked = occupiedSet.has(period);
          return (
            <button
              key={period}
              type="button"
              onClick={() => toggle(i)}
              disabled={mutation.isPending}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border text-xs font-medium transition-colors select-none",
                checked
                  ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400"
                  : "bg-muted/30 border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
              )}
            >
              {label}
              <span className={cn(
                "w-3 h-3 rounded-sm border flex items-center justify-center",
                checked ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground/30"
              )}>
                {checked && (
                  <svg viewBox="0 0 10 10" className="w-2 h-2 text-white fill-current">
                    <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Short-term: nights per month grid ────────────────────────────────────
function ShortTermGrid({ property, year }: { property: PropertyOccupancy; year: number }) {
  const qc = useQueryClient();
  // Local draft values so the input feels instant; committed on blur/Enter
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Seed drafts from saved records when property/year changes
  useEffect(() => {
    const initial: Record<string, string> = {};
    property.occupancyRecords
      .filter((r) => r.period.length === 7 && r.period.startsWith(`${year}-`) && r.nights != null)
      .forEach((r) => { initial[r.period] = String(r.nights); });
    setDrafts(initial);
  }, [property.id, year, property.occupancyRecords]);

  const mutation = useMutation({
    mutationFn: (vars: { period: string; nights: number | null }) =>
      saveRecord({ propertyId: property.id, period: vars.period, occupied: (vars.nights ?? 0) > 0, nights: vars.nights }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["occupancy"] }),
  });

  const commit = (period: string) => {
    const raw = drafts[period] ?? "";
    const n = raw === "" ? null : Math.max(0, Math.min(parseInt(raw, 10) || 0, new Date(parseInt(period.slice(0, 4)), parseInt(period.slice(5, 7)), 0).getDate()));
    // Normalise the draft to the clamped value
    setDrafts((d) => ({ ...d, [period]: n == null ? "" : String(n) }));
    mutation.mutate({ period, nights: n });
  };

  const totalNights = Object.values(drafts).reduce((sum, v) => sum + (parseInt(v) || 0), 0);
  const maxNights = Array.from({ length: 12 }, (_, i) => new Date(year, i + 1, 0).getDate()).reduce((a, b) => a + b, 0);
  const pct = maxNights > 0 ? Math.round((totalNights / maxNights) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{totalNights}</span> nights booked in {year}
        </p>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-28 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-medium text-foreground">{pct}%</span>
        </div>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5">
        {MONTHS.map((label, i) => {
          const period = `${year}-${String(i + 1).padStart(2, "0")}`;
          const daysInMonth = new Date(year, i + 1, 0).getDate();
          const val = drafts[period] ?? "";
          const nights = parseInt(val) || 0;
          const hasNights = val !== "" && nights > 0;
          return (
            <div
              key={period}
              className={cn(
                "rounded-lg border p-2 flex flex-col gap-1.5 transition-colors",
                hasNights
                  ? "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800"
                  : "bg-muted/30 border-border"
              )}
            >
              <p className={cn("text-xs font-medium text-center", hasNights ? "text-blue-700 dark:text-blue-400" : "text-muted-foreground")}>
                {label}
              </p>
              <input
                type="number"
                min="0"
                max={daysInMonth}
                value={val}
                onChange={(e) => setDrafts((d) => ({ ...d, [period]: e.target.value }))}
                onBlur={() => commit(period)}
                onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
                placeholder="0"
                className={cn(
                  "w-full text-center text-sm font-bold rounded-md border px-1 py-1 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-400 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                  hasNights ? "border-blue-300 text-blue-700 dark:text-blue-400" : "border-border text-foreground"
                )}
              />
              <p className="text-xs text-center text-muted-foreground/60">/{daysInMonth}d</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Rental type pill selector ─────────────────────────────────────────────
function RentalTypeSelector({ property }: { property: PropertyOccupancy }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);

  const set = async (type: RentalType) => {
    if (pending || type === property.rentalType) return;
    setPending(true);
    try {
      await updateRentalType(property.id, type === property.rentalType ? null : type);
      qc.invalidateQueries({ queryKey: ["occupancy"] });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs gap-0.5">
      <button
        onClick={() => set(property.rentalType === "long-term" ? null : "long-term")}
        disabled={pending}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-colors",
          property.rentalType === "long-term"
            ? "bg-emerald-500 text-white shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Home className="w-3 h-3" /> Long-term
      </button>
      <button
        onClick={() => set(property.rentalType === "short-term" ? null : "short-term")}
        disabled={pending}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-colors",
          property.rentalType === "short-term"
            ? "bg-blue-500 text-white shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <BedDouble className="w-3 h-3" /> Short-term
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function Occupancy() {
  const today = new Date();
  const [filter, setFilter] = useState<"all" | "long-term" | "short-term">("all");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const { data, isLoading, isError } = useQuery<PropertyOccupancy[]>({
    queryKey: ["occupancy"],
    queryFn: fetchOccupancy,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-48 bg-muted animate-pulse rounded" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-44 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-center text-destructive">
        <p className="font-semibold">Failed to load occupancy data</p>
      </div>
    );
  }

  const filtered = data.filter(p =>
    filter === "all" ? true : p.rentalType === filter
  );

  const unassigned = data.filter(p => !p.rentalType);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Occupancy</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Track which properties are rented out month-by-month or day-by-day.
        </p>
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Filter tabs */}
        <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
          {(["all", "long-term", "short-term"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-md font-medium transition-colors capitalize",
                filter === f
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "all" ? "All" : f === "long-term" ? "Long-term" : "Short-term"}
            </button>
          ))}
        </div>

        {/* Month navigator — only relevant for STR view */}
        {(filter === "short-term" || (filter === "all" && data.some(p => p.rentalType === "short-term"))) && (
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1">
            <button onClick={prevMonth} className="p-0.5 hover:text-primary transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium w-28 text-center">{MONTH_NAMES[month]} {year}</span>
            <button onClick={nextMonth} className="p-0.5 hover:text-primary transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Year navigator — for LTR view */}
        {(filter === "long-term" || (filter === "all" && data.some(p => p.rentalType === "long-term"))) && (
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1">
            <button onClick={() => setYear(y => y - 1)} className="p-0.5 hover:text-primary transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium w-10 text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="p-0.5 hover:text-primary transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Unassigned nudge */}
      {unassigned.length > 0 && filter !== "all" && (
        <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 border border-border">
          {unassigned.length} propert{unassigned.length > 1 ? "ies don't" : "y doesn't"} have a rental type set yet.{" "}
          <button onClick={() => setFilter("all")} className="underline hover:text-foreground">View all</button> to assign one.
        </p>
      )}

      {/* Property cards */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No properties in this category</p>
          <p className="text-sm mt-1">Set a rental type on a property to see it here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(property => (
            <Card key={property.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <p className="font-semibold text-foreground leading-tight">{property.name}</p>
                      <p className="text-xs text-muted-foreground">{property.address}</p>
                    </div>
                  </div>
                  <RentalTypeSelector property={property} />
                </div>
              </CardHeader>

              {property.rentalType && (
                <CardContent className="pt-0">
                  {property.rentalType === "long-term" ? (
                    <LongTermGrid property={property} year={year} />
                  ) : (
                    <ShortTermGrid property={property} year={year} />
                  )}
                </CardContent>
              )}

              {!property.rentalType && (
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground italic">
                    Select a rental type above to start tracking occupancy.
                  </p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Summary footer */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          {filtered
            .filter(p => p.rentalType === "long-term")
            .map(p => {
              const occupied = p.occupancyRecords.filter(r => r.occupied && r.period.startsWith(`${year}-`) && r.period.length === 7).length;
              return { name: p.name, pct: Math.round((occupied / 12) * 100), type: "long-term" };
            })
            .concat(
              filtered
                .filter(p => p.rentalType === "short-term")
                .map(p => {
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
                  const occupied = p.occupancyRecords.filter(r => r.occupied && r.period.startsWith(`${monthStr}-`)).length;
                  return { name: p.name, pct: Math.round((occupied / daysInMonth) * 100), type: "short-term" };
                })
            )
            .filter(s => s.pct !== undefined)
            .slice(0, 4)
            .map((s, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-3 space-y-1">
                <p className="text-xs text-muted-foreground truncate">{s.name}</p>
                <p className="text-lg font-bold text-foreground">{s.pct}%</p>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", s.type === "long-term" ? "bg-emerald-500" : "bg-blue-500")}
                    style={{ width: `${s.pct}%` }}
                  />
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
