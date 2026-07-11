import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { Map, ToggleLeft, ToggleRight, Loader2, Building2, TrendingUp, DollarSign, Landmark, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
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

// ── Equity colour helper ───────────────────────────────────────────────────
// Maps equity amount to a colour: red → amber → emerald
function equityColor(equity: number, maxEquity: number): string {
  if (maxEquity <= 0) return "#6b7280";
  const ratio = Math.max(0, Math.min(1, equity / maxEquity));
  if (ratio >= 0.66) return "#10b981"; // emerald-500
  if (ratio >= 0.33) return "#f59e0b"; // amber-400
  return "#ef4444";                    // red-500
}

function equityRadius(equity: number, maxEquity: number): number {
  if (maxEquity <= 0) return 14;
  const ratio = Math.max(0, Math.min(1, equity / maxEquity));
  return 10 + ratio * 20; // 10px – 30px
}

// ── Map suggestions ────────────────────────────────────────────────────────

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
  const [mode, setMode] = useState<"properties" | "equity">("properties");
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

  const mapped = useMemo(
    () => (data?.properties ?? []).filter(p => p.lat !== null && p.lng !== null),
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

  // Portfolio-level totals
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Map className="w-7 h-7 text-primary" />
          Map View
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          See where your properties are and how equity is distributed across markets.
        </p>
      </div>

      {/* Portfolio summary strip */}
      {data && (
        <div className="flex flex-wrap gap-px rounded-lg border overflow-hidden text-sm">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-card flex-1 min-w-[120px]">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground whitespace-nowrap">Properties</span>
            <span className="font-semibold text-foreground ml-auto">{totals.count}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 bg-card flex-1 min-w-[140px]">
            <DollarSign className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground whitespace-nowrap">Total Value</span>
            <span className="font-semibold text-foreground ml-auto">{formatCurrency(totals.value)}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 bg-card flex-1 min-w-[140px]">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="text-muted-foreground whitespace-nowrap">Equity</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400 ml-auto">{formatCurrency(totals.equity)}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 bg-card flex-1 min-w-[140px]">
            <Landmark className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground whitespace-nowrap">Total Debt</span>
            <span className="font-semibold text-foreground ml-auto">{formatCurrency(totals.debt)}</span>
          </div>
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
              <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> Medium equity
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Lower equity
            </span>
            <span className="ml-auto italic">Circle size also reflects equity amount</span>
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

              {mode === "properties" && mapped.map(p => (
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
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}

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
            </MapContainer>
          )}
        </div>
      </Card>

      {/* By-city breakdown */}
      {data && data.byCity.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">By City</h2>
          <div className="rounded-lg border divide-y overflow-hidden">
            {data.byCity.map(c => {
              const equityPct = c.totalValue > 0 ? (c.totalEquity / c.totalValue) * 100 : 0;
              const label = c.state ? `${c.city}, ${c.state}` : c.city;
              const isOpen = expandedCities.has(label);
              return (
                <div key={label} className="bg-card">
                  {/* Header row — always visible */}
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
                    <div className="flex items-center gap-3 shrink-0">
                      {/* Equity pill preview */}
                      <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full">
                        {formatPercent(equityPct)} equity
                      </span>
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
                      <div className="space-y-1">
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
