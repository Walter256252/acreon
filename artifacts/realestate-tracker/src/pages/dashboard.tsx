import { useGetDashboard } from "@workspace/api-client-react";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Link } from "wouter";
import { Building, DollarSign, PieChart, Landmark } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PortfolioChat } from "@/components/portfolio-chat";

export default function Dashboard() {
  const { data, isLoading, isError } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 bg-muted animate-pulse rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl"></div>)}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-center text-destructive">
        <h2 className="text-xl font-bold">Failed to load dashboard</h2>
        <p className="mt-2 text-muted-foreground">Please check your connection and try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Portfolio Overview</h1>
        <p className="text-muted-foreground mt-1 text-sm">Real-time valuation and equity breakdown.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Value"
          value={formatCurrency(data.totalPortfolioValue)}
          icon={<Building className="w-5 h-5" />}
          subtext={`${data.totalProperties} properties`}
        />
        <StatCard
          title="Total Debt"
          value={formatCurrency(data.totalLoanBalance)}
          icon={<Landmark className="w-5 h-5 text-destructive" />}
        />
        <StatCard
          title="Total Equity"
          value={formatCurrency(data.totalEquity)}
          icon={<PieChart className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />}
          trend="up"
          trendValue={formatPercent(data.totalPortfolioValue > 0 ? (data.totalEquity / data.totalPortfolioValue) * 100 : 0)}
        />
        <StatCard
          title="Monthly Obligations"
          value={formatCurrency(data.monthlyPaymentTotal)}
          icon={<DollarSign className="w-5 h-5" />}
        />
      </div>

      <div>
        <h2 className="text-xl font-bold tracking-tight mb-4 mt-8 text-foreground border-b pb-2">Properties</h2>
        
        {data.properties.length === 0 ? (
          <div className="text-center py-12 bg-muted/30 rounded-xl border border-dashed border-border">
            <Building className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
            <h3 className="text-lg font-medium text-foreground">No properties tracked</h3>
            <p className="text-muted-foreground text-sm mt-1 mb-4">Start building your portfolio to see analytics.</p>
            <Button asChild variant="outline">
              <Link href="/properties/new">Add your first property</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.properties.map((prop) => (
              <Link key={prop.id} href={`/properties/${prop.id}`}>
                <Card className="p-5 hover-elevate transition-colors border-l-4 border-l-primary cursor-pointer h-full flex flex-col justify-between group">
                  <div>
                    <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">{prop.name}</h3>
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
                      <div className="flex items-baseline gap-1">
                        <p className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-500">{formatCurrency(prop.equity)}</p>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">{formatPercent(prop.equityPercent)}</p>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t w-full flex items-center justify-between text-xs text-muted-foreground">
                    <span>View full amortization &rarr;</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <PortfolioChat />
    </div>
  );
}
