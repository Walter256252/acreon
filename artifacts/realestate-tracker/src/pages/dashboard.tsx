import { useGetDashboard } from "@workspace/api-client-react";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Building, DollarSign, PieChart, Landmark } from "lucide-react";
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

      <PortfolioChat />
    </div>
  );
}
