import { useState } from "react";
import { useGetDashboard } from "@workspace/api-client-react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Link } from "wouter";
import { Building, PlusCircle, List, BarChart2, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function zillowUrl(prop: { zillowUrl?: string | null; address: string }) {
  return prop.zillowUrl || `https://www.zillow.com/homes/${encodeURIComponent(prop.address)}_rb/`;
}

function valueStaleDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

type ViewMode = "simple" | "detailed";

export default function Properties() {
  const { data, isLoading, isError } = useGetDashboard();
  const [view, setView] = useState<ViewMode>("simple");

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="h-10 w-40 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-center text-destructive">
        <h2 className="text-xl font-bold">Failed to load properties</h2>
        <p className="mt-2 text-muted-foreground">Please check your connection and try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Building className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Properties</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {data.properties.length === 0
              ? "No properties tracked yet."
              : `${data.properties.length} propert${data.properties.length === 1 ? "y" : "ies"} in your portfolio.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data.properties.length > 0 && (
            <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
              <button
                type="button"
                onClick={() => setView("simple")}
                title="Name & address only"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  view === "simple"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <List className="w-3.5 h-3.5" />
                Simple
              </button>
              <button
                type="button"
                onClick={() => setView("detailed")}
                title="Value, debt & equity"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  view === "detailed"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <BarChart2 className="w-3.5 h-3.5" />
                Detailed
              </button>
            </div>
          )}
          <Button asChild>
            <Link href="/app/properties/new">
              <PlusCircle className="w-4 h-4 mr-2" />
              Add Property
            </Link>
          </Button>
        </div>
      </div>

      {data.properties.length === 0 ? (
        <div className="text-center py-16 bg-muted/30 rounded-xl border border-dashed border-border">
          <Building className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-medium text-foreground">No properties tracked</h3>
          <p className="text-muted-foreground text-sm mt-1 mb-4">
            Start building your portfolio to see analytics.
          </p>
          <Button asChild variant="outline">
            <Link href="/app/properties/new">Add your first property</Link>
          </Button>
        </div>
      ) : view === "detailed" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.properties.map((prop) => (
            <Link key={prop.id} href={`/app/properties/${prop.id}`}>
              <Card className="p-5 hover-elevate transition-colors border-l-4 border-l-primary cursor-pointer h-full flex flex-col justify-between group">
                <div>
                  <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">
                    {prop.name}
                  </h3>
                  <p className="text-sm text-muted-foreground truncate">{prop.address}</p>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Value</p>
                    <p className="font-mono text-sm font-medium">{formatCurrency(prop.currentValue)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Debt</p>
                    <p className="font-mono text-sm font-medium">{formatCurrency(prop.estimatedBalance)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Equity</p>
                    <p className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-500">
                      {formatCurrency(prop.equity)}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">
                      {formatPercent(prop.equityPercent)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
                  <span>View full amortization &rarr;</span>
                  {(() => {
                    const days = valueStaleDays(prop.valueLastUpdatedAt);
                    const stale = days === null || days >= 30;
                    if (!stale) return null;
                    return (
                      <a
                        href={zillowUrl(prop)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded font-medium transition-colors",
                          days === null || days >= 90
                            ? "text-amber-600 bg-amber-50 hover:bg-amber-100 dark:text-amber-400 dark:bg-amber-950/30"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {days === null ? "Value never refreshed" : `Value ${days}d old`}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    );
                  })()}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        /* Simple list view */
        <div className="flex flex-col gap-2">
          {data.properties.map((prop, i) => (
            <Link key={prop.id} href={`/app/properties/${prop.id}`}>
              <Card className="px-5 py-4 hover-elevate cursor-pointer flex items-center gap-4 group border-l-4 border-l-primary">
                <span className="text-xs font-mono text-muted-foreground w-5 text-right flex-shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                    {prop.name}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">{prop.address}</p>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">&rarr;</span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
