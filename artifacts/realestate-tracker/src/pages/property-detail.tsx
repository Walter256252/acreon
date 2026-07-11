import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetProperty,
  getGetPropertyQueryKey,
  useGetAmortizationSchedule,
  getGetAmortizationScheduleQueryKey,
  useDeleteProperty,
  getGetDashboardQueryKey,
  getListPropertiesQueryKey,
  useRunCalculator,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatPercent, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Edit,
  Trash2,
  MapPin,
  Calendar,
  Building,
  DollarSign,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  Clock,
  Plus,
  X,
} from "lucide-react";
import { Link } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

interface OneTimeExtra {
  paymentNumber: string;
  amount: string;
}

export default function PropertyDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: property, isLoading: propLoading } = useGetProperty(id, {
    query: { enabled: !!id, queryKey: getGetPropertyQueryKey(id) },
  });

  const { data: schedule, isLoading: schedLoading } = useGetAmortizationSchedule(id, {
    query: { enabled: !!id, queryKey: getGetAmortizationScheduleQueryKey(id) },
  });

  const deleteProperty = useDeleteProperty();
  const runCalculator = useRunCalculator();

  // View mode state
  const [viewMode, setViewMode] = useState<"all" | "current">("all");
  const currentRowRef = useRef<HTMLTableRowElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Scenario state
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [extraMonthly, setExtraMonthly] = useState("");
  const [oneTimeExtras, setOneTimeExtras] = useState<OneTimeExtra[]>([{ paymentNumber: "", amount: "" }]);
  const [scenarioResult, setScenarioResult] = useState<ReturnType<typeof useRunCalculator>["data"] | null>(null);
  const [showingScenario, setShowingScenario] = useState(false);

  const handleDelete = () => {
    deleteProperty.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Property Deleted", description: "The property has been removed." });
        queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setLocation("/");
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to delete property.", variant: "destructive" });
      },
    });
  };

  const handleRunScenario = () => {
    if (!property) return;
    const validExtras = oneTimeExtras
      .filter(e => e.paymentNumber && e.amount && Number(e.amount) > 0)
      .map(e => ({ paymentNumber: Number(e.paymentNumber), amount: Number(e.amount) }));

    runCalculator.mutate({
      data: {
        loanAmount: property.loanAmount,
        interestRate: property.interestRate,
        loanTermYears: property.loanTermYears,
        loanStartDate: property.loanStartDate,
        monthlyPayment: property.monthlyPayment,
        extraPaymentMonthly: extraMonthly ? Number(extraMonthly) : 0,
        extraPayments: validExtras.length > 0 ? validExtras : undefined,
      },
    }, {
      onSuccess: (result) => {
        setScenarioResult(result);
        setShowingScenario(true);
        toast({ title: "Scenario calculated", description: `You'd save ${result.summary.monthsSaved} months and ${formatCurrency(result.summary.interestSaved)} in interest.` });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to run scenario.", variant: "destructive" });
      },
    });
  };

  const clearScenario = () => {
    setScenarioResult(null);
    setShowingScenario(false);
    setExtraMonthly("");
    setOneTimeExtras([{ paymentNumber: "", amount: "" }]);
  };

  const addOneTime = () => {
    if (oneTimeExtras.length < 5) {
      setOneTimeExtras([...oneTimeExtras, { paymentNumber: "", amount: "" }]);
    }
  };

  const removeOneTime = (i: number) => {
    setOneTimeExtras(oneTimeExtras.filter((_, idx) => idx !== i));
  };

  const updateOneTime = (i: number, field: keyof OneTimeExtra, value: string) => {
    setOneTimeExtras(oneTimeExtras.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  };

  // Calculate which payment number is "current" based on today vs loan start date
  const currentPaymentNumber = (() => {
    if (!property) return 1;
    const start = new Date(property.loanStartDate);
    const now = new Date();
    const months =
      (now.getFullYear() - start.getFullYear()) * 12 +
      (now.getMonth() - start.getMonth());
    return Math.min(Math.max(months + 1, 1), schedule?.length || 1);
  })();

  // Scroll to current row when switching to "all" mode
  useEffect(() => {
    if (viewMode === "all" && currentRowRef.current && tableScrollRef.current) {
      const container = tableScrollRef.current;
      const row = currentRowRef.current;
      const rowTop = row.offsetTop;
      const rowHeight = row.offsetHeight;
      const containerHeight = container.clientHeight;
      container.scrollTop = rowTop - containerHeight / 2 + rowHeight / 2;
    }
  }, [viewMode, currentPaymentNumber]);

  if (propLoading || schedLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-32 bg-muted animate-pulse rounded mb-4" />
        <div className="h-32 bg-muted animate-pulse rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
        </div>
        <div className="h-96 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!property) return <div className="p-8 text-center text-destructive font-bold">Property not found.</div>;

  // Merge base schedule with scenario schedule for side-by-side comparison
  const baseSchedule = schedule ?? [];
  const scenarioSchedule = scenarioResult?.schedule ?? [];
  const scenarioSummary = scenarioResult?.summary;
  const maxRows = Math.max(baseSchedule.length, showingScenario ? scenarioSchedule.length : 0);

  const currentBalance = baseSchedule.length > 0 ? baseSchedule[baseSchedule.length - 1]?.remainingBalance ?? 0 : property.loanAmount;
  const estimatedEquity = property.currentValue - currentBalance;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{property.name}</h1>
          <div className="flex items-center gap-2 mt-2 text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span className="text-sm">{property.address}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/properties/${id}/edit`}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Link>
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the property and all associated data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                  Delete Property
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Current Value"
          value={formatCurrency(property.currentValue)}
          subtext={`Bought ${property.yearBought} for ${formatCurrency(property.purchasePrice)}`}
          icon={<Building className="w-5 h-5 text-muted-foreground" />}
        />
        <StatCard
          title="Loan Amount"
          value={formatCurrency(property.loanAmount)}
          subtext={`${property.loanTermYears} yr @ ${property.interestRate}%`}
          icon={<DollarSign className="w-5 h-5 text-muted-foreground" />}
        />
        <StatCard
          title="Current Balance"
          value={formatCurrency(currentBalance)}
          subtext="End of projected schedule"
          icon={<Calendar className="w-5 h-5 text-muted-foreground" />}
        />
        <StatCard
          title="Estimated Equity"
          value={formatCurrency(estimatedEquity)}
          subtext={formatPercent(property.currentValue > 0 ? (estimatedEquity / property.currentValue) * 100 : 0) + " of value"}
          icon={<DollarSign className="w-5 h-5 text-muted-foreground" />}
        />
      </div>

      {/* Amortization + Scenario */}
      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Amortization Schedule</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {baseSchedule.length} payments &mdash; payoff {baseSchedule.length > 0 ? formatDate(baseSchedule[baseSchedule.length - 1].paymentDate) : "—"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
                <button
                  onClick={() => setViewMode("all")}
                  className={`px-3 py-1.5 rounded-md transition-colors font-medium ${
                    viewMode === "all"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All Payments
                </button>
                <button
                  onClick={() => setViewMode("current")}
                  className={`px-3 py-1.5 rounded-md transition-colors font-medium ${
                    viewMode === "current"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Current &amp; Forward
                </button>
              </div>

              <Button
                variant={scenarioOpen ? "default" : "outline"}
                size="sm"
                onClick={() => setScenarioOpen(!scenarioOpen)}
                data-testid="button-toggle-scenario"
              >
                {scenarioOpen ? <ChevronUp className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
                Try a Scenario
              </Button>
            </div>
          </div>

          {/* Scenario Panel */}
          {scenarioOpen && (
            <div className="rounded-xl border border-border bg-muted/30 p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-foreground">What-If Scenario</h3>
                {scenarioResult && (
                  <Button variant="ghost" size="sm" onClick={clearScenario} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3 h-3 mr-1" /> Clear
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="extra-monthly" className="text-xs font-medium">Extra Monthly Payment ($)</Label>
                  <Input
                    id="extra-monthly"
                    type="number"
                    min="0"
                    step="50"
                    placeholder="e.g. 300"
                    value={extraMonthly}
                    onChange={e => setExtraMonthly(e.target.value)}
                    data-testid="input-extra-monthly"
                  />
                  <p className="text-xs text-muted-foreground">Added to every monthly payment</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">One-Time Extra Payments</Label>
                    {oneTimeExtras.length < 5 && (
                      <button
                        onClick={addOneTime}
                        className="text-xs text-primary hover:underline flex items-center gap-0.5"
                        data-testid="button-add-onetime"
                      >
                        <Plus className="w-3 h-3" /> Add
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {oneTimeExtras.map((entry, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input
                          type="number"
                          min="1"
                          placeholder="Payment #"
                          value={entry.paymentNumber}
                          onChange={e => updateOneTime(i, "paymentNumber", e.target.value)}
                          className="w-28 text-sm"
                          data-testid={`input-onetime-number-${i}`}
                        />
                        <Input
                          type="number"
                          min="0"
                          placeholder="Amount $"
                          value={entry.amount}
                          onChange={e => updateOneTime(i, "amount", e.target.value)}
                          className="flex-1 text-sm"
                          data-testid={`input-onetime-amount-${i}`}
                        />
                        {oneTimeExtras.length > 1 && (
                          <button onClick={() => removeOneTime(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleRunScenario}
                  disabled={runCalculator.isPending || (!extraMonthly && oneTimeExtras.every(e => !e.amount))}
                  data-testid="button-run-scenario"
                >
                  {runCalculator.isPending ? "Calculating..." : "Calculate Scenario"}
                </Button>
                {showingScenario && (
                  <button
                    onClick={() => setShowingScenario(!showingScenario)}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    {showingScenario ? "Hide comparison" : "Show comparison"}
                  </button>
                )}
              </div>

              {/* Scenario Summary */}
              {scenarioSummary && showingScenario && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-border">
                  <div className="bg-background rounded-lg p-3 border border-border">
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Months Saved
                    </p>
                    <p className="text-lg font-bold text-primary">{scenarioSummary.monthsSaved}</p>
                  </div>
                  <div className="bg-background rounded-lg p-3 border border-border">
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <TrendingDown className="w-3 h-3" /> Interest Saved
                    </p>
                    <p className="text-lg font-bold text-primary">{formatCurrency(scenarioSummary.interestSaved)}</p>
                  </div>
                  <div className="bg-background rounded-lg p-3 border border-border">
                    <p className="text-xs text-muted-foreground mb-1">Payoff Date</p>
                    <p className="text-lg font-bold">{formatDate(scenarioSummary.payoffDate)}</p>
                  </div>
                  <div className="bg-background rounded-lg p-3 border border-border">
                    <p className="text-xs text-muted-foreground mb-1">Total Payments</p>
                    <p className="text-lg font-bold">{scenarioSummary.totalPayments}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent>
          {showingScenario && scenarioResult && (
            <div className="flex items-center gap-3 mb-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-muted border border-border" />
                Base schedule
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-primary/20 border border-primary/40" />
                Scenario
              </span>
              <Badge variant="secondary" className="text-xs ml-auto">
                Scenario ends {scenarioSummary?.monthsSaved ?? 0} months earlier
              </Badge>
            </div>
          )}

          {viewMode === "current" && (
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-primary" />
              Showing from payment #{currentPaymentNumber} (today) through payoff
            </p>
          )}

          <div ref={tableScrollRef} className="rounded-md border border-border h-[600px] overflow-auto">
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
                <TableRow>
                  <TableHead className="w-[60px]">No.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Payment</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right font-semibold text-foreground">Balance</TableHead>
                  {showingScenario && scenarioResult && (
                    <TableHead className="text-right text-primary font-semibold border-l border-primary/20 bg-primary/5">
                      Scenario Bal.
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: showingScenario ? maxRows : baseSchedule.length }, (_, idx) => {
                  const base = baseSchedule[idx];
                  const scen = showingScenario ? scenarioSchedule[idx] : undefined;
                  const isScenarioPaidOff = showingScenario && !scen && !!base;
                  const paymentNum = base?.paymentNumber ?? (scen?.paymentNumber ?? idx + 1);
                  const isCurrent = paymentNum === currentPaymentNumber;
                  const isPast = paymentNum < currentPaymentNumber;

                  // In "current" mode, hide past payments
                  if (viewMode === "current" && isPast) return null;

                  return (
                    <TableRow
                      key={paymentNum}
                      ref={isCurrent ? currentRowRef : undefined}
                      className={[
                        isScenarioPaidOff ? "opacity-40" : "",
                        isCurrent
                          ? "bg-primary/8 border-l-2 border-l-primary"
                          : isPast
                          ? "opacity-50"
                          : "",
                      ].join(" ")}
                      data-testid={`row-amortization-${paymentNum}`}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          {isCurrent && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                          )}
                          {paymentNum}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className={isCurrent ? "font-semibold text-foreground" : ""}>
                          {formatDate(base?.paymentDate ?? scen?.paymentDate ?? "")}
                        </span>
                        {isCurrent && (
                          <span className="ml-2 text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                            current
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {base ? formatCurrency(base.paymentAmount) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {base ? formatCurrency(base.principalAmount) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {base ? formatCurrency(base.interestAmount) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {base ? formatCurrency(base.remainingBalance) : "—"}
                      </TableCell>
                      {showingScenario && scenarioResult && (
                        <TableCell className="text-right font-mono text-sm font-semibold border-l border-primary/20 bg-primary/5 text-primary">
                          {scen ? formatCurrency(scen.remainingBalance) : (
                            <span className="text-xs text-muted-foreground font-normal">Paid off</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Property Notes */}
      {property.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{property.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
