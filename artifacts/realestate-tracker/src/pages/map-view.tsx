import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { Map, Loader2, Building2, TrendingUp, DollarSign, Landmark, ChevronDown, CalendarDays, AlertTriangle, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { PortfolioChat } from "@/components/portfolio-chat";

// Fix Leaflet default marker icons in Vite
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

// ── Types ──────────────────────────────────────────────────────────────────

interface GeoProperty {
  id: number;
  name: string;
  address: string;
  currentValue: number;
  equity: number;
  equityPct: number;
  loanBalance: number;
  purchasePrice: number;
  monthlyPayment: number;
  interestRate: number;
  lat: number | null;
  lng: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

interface CityGroup {
  city: string;
  state: string | null;
  count: number;
  totalValue: number;
  totalEquity: number;
  totalDebt: number;
  totalMonthly: number;
}

interface GeoResponse {
  properties: GeoProperty[];
  byCity: CityGroup[];
}

interface OccupancyRecord {
  period: string;
  occupied: boolean;
  nights: number | null;
}

interface OccupancyProperty {
  id: number;
  name: string;
  rentalType: string | null;
  occupancyRecords: OccupancyRecord[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysInMonth(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** Returns 0–100 or null if no data */
function calcOccupancyPct(prop: OccupancyProperty): number | null {
  const records = prop.occupancyRecords;
  if (!records.length) return null;

  if (prop.rentalType === "short-term") {
    const totalNights = records.reduce((s, r) => s + (r.nights ?? 0), 0);
    const totalPossible = records.reduce((s, r) => s + daysInMonth(r.period), 0);
    return totalPossible > 0 ? (totalNights / totalPossible) * 100 : null;
  }

  // long-term or unknown — occupied month ratio
  const occupied = records.filter(r => r.occupied).length;
  return (occupied / records.length) * 100;
}

function equityColor(equity: number, maxEquity: number): string {
  if (maxEquity <= 0) return "#6b7280";
  const ratio = Math.max(0, Math.min(1, equity / maxEquity));
  if (ratio >= 0.66) return "#10b981";
  if (ratio >= 0.33) return "#f59e0b";
  return "#ef4444";
}

function equityRadius(equity: number, maxEquity: number): number {
  if (maxEquity <= 0) return 14;
  const ratio = Math.max(0, Math.min(1, equity / maxEquity));
  return 10 + ratio * 20;
}

function occupancyColor(pct: number): string {
  if (pct >= 80) return "#10b981"; // emerald
  if (pct >= 50) return "#eab308"; // yellow
  return "#ef4444";                // red
}

const MAP_SUGGESTIONS = [
  "Which city has the most equity across my properties?",
  "How does my portfolio value compare across different markets?",
  "Which location has the best equity-to-value ratio?",
  "What's my total monthly obligation per city?",
  "Which property has appreciated the most since purchase?",
  "Should I consider diversifying to other markets based on my current holdings?",
];

// ── Component ──────────────────────────────────────────────────────────────

export default function MapView() {
  const [mode, setMode] = useState<"properties" | "equity" | "occupancy">("properties");
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());

  const toggleCity = (label: string) => {
    setExpandedCities(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const { data, isLoading, isError } = useQuery<GeoResponse>({
    queryKey: ["properties-geo-user"],
    queryFn: () => fetch("/api/properties-geo").then(r => {
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: occupancyData } = useQuery<OccupancyProperty[]>({
    queryKey: ["occupancy"],
    queryFn: () => fetch("/api/occupancy").then(r => {
      if (!r.ok) throw new Error("Failed to load occupancy");
      return r.json();
    }),
    staleTime: 5 * 60 * 1000,
  });

  // Map occupancy pct by property id
  const occupancyByPropId = useMemo<Record<number, number | null>>(() => {
    if (!occupancyData) return {};
    return Object.fromEntries(
      occupancyData.map(p => [p.id, calcOccupancyPct(p)])
    );
  }, [occupancyData]);

  const navigate = useNavigate();

  const mapped = useMemo(
    () => (data?.properties ?? []).filter(p => p.lat !== null && p.lng !== null),
    [data]
  );

  const unmapped = useMemo(
    () => (data?.properties ?? []).filter(p => p.lat === null || p.lng === null),
    [data]
  );

  const maxEquity = useMemo(
    () => Math.max(0, ...mapped.map(p => p.equity)),
    [mapped]
  );

  const center: [number, number] = useMemo(() => {
    if (!mapped.length) return [39.5, -98.35];
    return [
      mapped.reduce((s, p) => s + p.lat!, 0) / mapped.length,
      mapped.reduce((s, p) => s + p.lng!, 0) / mapped.length,
    ];
  }, [mapped]);

  const totals = useMemo(() => {
    const props = data?.properties ?? [];
    return {
      count: props.length,
      value: props.reduce((s, p) => s + p.currentValue, 0),
      equity: props.reduce((s, p) => s + p.equity, 0),
      debt: props.reduce((s, p) => s + p.loanBalance, 0),
      monthly: props.reduce((s, p) => s + p.monthlyPayment, 0),
    };
  }, [data]);

  // Portfolio-level avg occupancy (only tracked properties)
  const avgOccupancy = useMemo(() => {
    const vals = Object.values(occupancyByPropId).filter((v): v is number => v !== null);
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }, [occupancyByPropId]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Map className="w-7 h-7 text-primary" />
          Map View
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          See where your properties are and how equity and occupancy are distributed across markets.
        </p>
      </div>

      {/* Portfolio summary strip */}
      {data && (
        <div className="flex flex-wrap gap-px rounded-lg border overflow-hidden">
          <div className="flex flex-col gap-0.5 px-4 py-2.5 bg-card flex-1 min-w-[120px]">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="w-3 h-3 shrink-0" />
              Properties
            </span>
            <span className="text-sm font-semibold text-foreground">{totals.count}</span>
          </div>
          <div className="flex flex-col gap-0.5 px-4 py-2.5 bg-card flex-1 min-w-[140px]">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign className="w-3 h-3 shrink-0" />
              Total Value
            </span>
            <span className="text-sm font-semibold text-foreground">{formatCurrency(totals.value)}</span>
          </div>
          <div className="flex flex-col gap-0.5 px-4 py-2.5 bg-card flex-1 min-w-[140px]">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="w-3 h-3 shrink-0 text-emerald-600" />
              Equity
            </span>
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(totals.equity)}</span>
          </div>
          <div className="flex flex-col gap-0.5 px-4 py-2.5 bg-card flex-1 min-w-[140px]">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Landmark className="w-3 h-3 shrink-0" />
              Total Debt
            </span>
            <span className="text-sm font-semibold text-foreground">{formatCurrency(totals.debt)}</span>
          </div>
          {avgOccupancy !== null && (
            <div className="flex flex-col gap-0.5 px-4 py-2.5 bg-card flex-1 min-w-[140px]">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="w-3 h-3 shrink-0 text-blue-500" />
                Avg Occupancy
              </span>
              <span
                className="text-sm font-semibold"
                style={{ color: occupancyColor(avgOccupancy) }}
              >
                {formatPercent(avgOccupancy)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Map + toggle */}
      <Card className="overflow-hidden">
        {/* Toggle bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
          <p className="text-sm font-medium text-foreground">
            {mapped.length} {mapped.length === 1 ? "property" : "properties"} plotted
            {data && data.properties.length > mapped.length && (
              <span className="ml-2 text-xs text-amber-600">
                ({data.properties.length - mapped.length} address{data.properties.length - mapped.length !== 1 ? "es" : ""} not geocoded)
              </span>
            )}
          </p>
          <div className="flex items-center gap-1 bg-background rounded-lg border border-border p-1">
            <button
              onClick={() => setMode("properties")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === "properties"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Properties
            </button>
            <button
              onClick={() => setMode("equity")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === "equity"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Equity
            </button>
            <button
              onClick={() => setMode("occupancy")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === "occupancy"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Occupancy
            </button>
          </div>
        </div>

        {/* Equity legend */}
        {mode === "equity" && (
          <div className="flex items-center gap-4 px-5 py-2 bg-muted/20 border-b border-border text-xs text-muted-foreground">
            <span className="font-medium">Equity legend:</span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> High equity
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> Medium equity
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Lower equity
            </span>
            <span className="ml-auto italic">Circle size also reflects equity amount</span>
          </div>
        )}

        {/* Occupancy legend */}
        {mode === "occupancy" && (
          <div className="flex items-center gap-4 px-5 py-2 bg-muted/20 border-b border-border text-xs text-muted-foreground">
            <span className="font-medium">Occupancy legend:</span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> ≥ 80%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> 50–80%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> &lt; 50%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-gray-400 inline-block" /> No data
            </span>
          </div>
        )}

        {/* Map */}
        <div className="h-[500px] w-full relative">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/60 z-[999]">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center px-8">
                Geocoding your property addresses — may take a moment on first load…
              </p>
            </div>
          )}
          {isError && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/60 z-[999]">
              <p className="text-sm text-destructive">Failed to load map data.</p>
            </div>
          )}
          {!isLoading && !isError && (
            <MapContainer
              center={center}
              zoom={mapped.length === 1 ? 12 : mapped.length === 0 ? 4 : 5}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {mode === "properties" && mapped.map(p => {
                const occ = occupancyByPropId[p.id];
                return (
                  <Marker key={p.id} position={[p.lat!, p.lng!]}>
                    <Popup>
                      <div className="min-w-[200px] space-y-2">
                        <div>
                          <p className="font-semibold text-sm">{p.name}</p>
                          <p className="text-xs text-gray-500 leading-tight">{p.address}</p>
                        </div>
                        <div className="space-y-0.5 text-xs border-t pt-2">
                          <div className="flex justify-between gap-6">
                            <span className="text-gray-500">Value</span>
                            <span className="font-medium">{formatCurrency(p.currentValue)}</span>
                          </div>
                          <div className="flex justify-between gap-6">
                            <span className="text-gray-500">Equity</span>
                            <span className="font-semibold text-emerald-700">{formatCurrency(p.equity)}</span>
                          </div>
                          <div className="flex justify-between gap-6">
                            <span className="text-gray-500">Debt</span>
                            <span className="font-medium">{formatCurrency(p.loanBalance)}</span>
                          </div>
                          <div className="flex justify-between gap-6">
                            <span className="text-gray-500">Monthly P&I</span>
                            <span className="font-medium">{formatCurrency(p.monthlyPayment)}</span>
                          </div>
                          {occ !== null && occ !== undefined && (
                            <div className="flex justify-between gap-6">
                              <span className="text-gray-500">Occupancy</span>
                              <span className="font-semibold" style={{ color: occupancyColor(occ) }}>
                                {formatPercent(occ)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {mode === "equity" && mapped.map(p => (
                <CircleMarker
                  key={p.id}
                  center={[p.lat!, p.lng!]}
                  radius={equityRadius(p.equity, maxEquity)}
                  pathOptions={{
                    fillColor: equityColor(p.equity, maxEquity),
                    fillOpacity: 0.85,
                    color: "#fff",
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="min-w-[200px] space-y-2">
                      <div>
                        <p className="font-semibold text-sm">{p.name}</p>
                        <p className="text-xs text-gray-500 leading-tight">{p.address}</p>
                      </div>
                      <div className="space-y-0.5 text-xs border-t pt-2">
                        <div className="flex justify-between gap-6">
                          <span className="text-gray-500">Equity</span>
                          <span className="font-bold" style={{ color: equityColor(p.equity, maxEquity) }}>
                            {formatCurrency(p.equity)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-6">
                          <span className="text-gray-500">Equity %</span>
                          <span className="font-medium">{formatPercent(p.equityPct)}</span>
                        </div>
                        <div className="flex justify-between gap-6">
                          <span className="text-gray-500">Value</span>
                          <span className="font-medium">{formatCurrency(p.currentValue)}</span>
                        </div>
                        <div className="flex justify-between gap-6">
                          <span className="text-gray-500">Remaining debt</span>
                          <span className="font-medium">{formatCurrency(p.loanBalance)}</span>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}

              {mode === "occupancy" && mapped.map(p => {
                const occ = occupancyByPropId[p.id];
                const hasData = occ !== null && occ !== undefined;
                const color = hasData ? occupancyColor(occ!) : "#9ca3af";
                const occupancyProp = occupancyData?.find(o => o.id === p.id);
                return (
                  <CircleMarker
                    key={p.id}
                    center={[p.lat!, p.lng!]}
                    radius={18}
                    pathOptions={{
                      fillColor: color,
                      fillOpacity: 0.85,
                      color: "#fff",
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <div className="min-w-[200px] space-y-2">
                        <div>
                          <p className="font-semibold text-sm">{p.name}</p>
                          <p className="text-xs text-gray-500 leading-tight">{p.address}</p>
                        </div>
                        <div className="space-y-0.5 text-xs border-t pt-2">
                          <div className="flex justify-between gap-6">
                            <span className="text-gray-500">Occupancy</span>
                            {hasData ? (
                              <span className="font-bold" style={{ color }}>
                                {formatPercent(occ!)}
                              </span>
                            ) : (
                              <span className="text-gray-400 italic">No data</span>
                            )}
                          </div>
                          {occupancyProp && (
                            <div className="flex justify-between gap-6">
                              <span className="text-gray-500">Type</span>
                              <span className="font-medium capitalize">
                                {occupancyProp.rentalType?.replace("-", " ") ?? "Unassigned"}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between gap-6">
                            <span className="text-gray-500">Value</span>
                            <span className="font-medium">{formatCurrency(p.currentValue)}</span>
                          </div>
                          <div className="flex justify-between gap-6">
                            <span className="text-gray-500">Equity</span>
                            <span className="font-semibold text-emerald-700">{formatCurrency(p.equity)}</span>
                          </div>
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          )}
        </div>
      </Card>

      {/* Ungeocodable properties callout */}
      {unmapped.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {unmapped.length === 1
                  ? "1 property couldn't be placed on the map"
                  : `${unmapped.length} properties couldn't be placed on the map`}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 mb-3">
                The address may be misspelled, missing a city/state, or not recognised by the map provider.
                Please verify each address and save any corrections — the map will update on your next visit.
              </p>
              <div className="space-y-2">
                {unmapped.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-4 rounded-md bg-amber-100 dark:bg-amber-900/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 truncate">{p.name}</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400 truncate">{p.address}</p>
                    </div>
                    <button
                      onClick={() => navigate(`/app/properties/${p.id}/edit`)}
                      className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 whitespace-nowrap shrink-0 underline underline-offset-2"
                    >
                      Edit address
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* By-city breakdown */}
      {data && data.byCity.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">By City</h2>
          <div className="rounded-lg border divide-y overflow-hidden">
            {data.byCity.map(c => {
              const equityPct = c.totalValue > 0 ? (c.totalEquity / c.totalValue) * 100 : 0;
              const label = c.state ? `${c.city}, ${c.state}` : c.city;
              const isOpen = expandedCities.has(label);

              // Avg occupancy for this city's properties
              const cityPropIds = (data.properties ?? [])
                .filter(p => {
                  const cityLabel = p.state ? `${p.city}, ${p.state}` : p.city;
                  return cityLabel === label;
                })
                .map(p => p.id);
              const cityOccVals = cityPropIds
                .map(id => occupancyByPropId[id])
                .filter((v): v is number => v !== null && v !== undefined);
              const cityAvgOcc = cityOccVals.length
                ? cityOccVals.reduce((s, v) => s + v, 0) / cityOccVals.length
                : null;

              return (
                <div key={label} className="bg-card">
                  {/* Header row */}
                  <button
                    onClick={() => toggleCity(label)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-muted/40 transition-colors"
                  >
                    <div>
                      <p className="font-semibold text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.count} {c.count === 1 ? "property" : "properties"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full">
                        {formatPercent(equityPct)} equity
                      </span>
                      {cityAvgOcc !== null && (
                        <span
                          className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                          style={{
                            color: occupancyColor(cityAvgOcc),
                            backgroundColor: cityAvgOcc >= 80
                              ? "rgb(240 253 244)"
                              : cityAvgOcc >= 50
                              ? "rgb(255 251 235)"
                              : "rgb(254 242 242)",
                          }}
                        >
                          <CalendarDays className="w-3 h-3" />
                          {formatPercent(cityAvgOcc)} occ.
                        </span>
                      )}
                      <ChevronDown
                        className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                      />
                    </div>
                  </button>

                  {/* Expandable detail */}
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 border-t bg-muted/20">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Total Value</p>
                          <p className="text-sm font-semibold mt-0.5">{formatCurrency(c.totalValue)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total Equity</p>
                          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                            {formatCurrency(c.totalEquity)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Remaining Debt</p>
                          <p className="text-sm font-semibold text-muted-foreground mt-0.5">
                            {formatCurrency(c.totalDebt)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Monthly P&I</p>
                          <p className="text-sm font-semibold mt-0.5">{formatCurrency(c.totalMonthly)}</p>
                        </div>
                      </div>

                      {/* Equity bar */}
                      <div className="space-y-1 mb-3">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Equity ratio</span>
                          <span className="font-medium">{formatPercent(equityPct)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                            style={{ width: `${Math.max(0, Math.min(100, equityPct))}%` }}
                          />
                        </div>
                      </div>

                      {/* Occupancy bar */}
                      {cityAvgOcc !== null && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Avg occupancy</span>
                            <span className="font-medium" style={{ color: occupancyColor(cityAvgOcc) }}>
                              {formatPercent(cityAvgOcc)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.max(0, Math.min(100, cityAvgOcc))}%`,
                                backgroundColor: occupancyColor(cityAvgOcc),
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No properties state */}
      {data && data.properties.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Map className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">No properties to map yet.</p>
          <p className="text-xs mt-1">Add a property to see it appear here.</p>
        </div>
      )}

      {/* AI assistant */}
      <PortfolioChat
        title="Map & Market AI Assistant"
        subtitle="Ask about your markets, locations, and geographic trends"
        conversationTitle="Map Assistant"
        suggestedQuestions={MAP_SUGGESTIONS}
      />
    </div>
  );
}
