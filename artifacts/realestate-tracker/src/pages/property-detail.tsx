import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetProperty,
  getGetPropertyQueryKey,
  useGetAmortizationSchedule,
  getGetAmortizationScheduleQueryKey,
  useDeleteProperty,
  useUpdateProperty,
  getGetDashboardQueryKey,
  getListPropertiesQueryKey,
  getGetProjectionsQueryKey,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Zap,
  ZapOff,
  Sparkles,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Pencil,
  Check,
  Receipt,
  TrendingUp,
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
import { cn } from "@/lib/utils";

function zillowUrl(property: { zillowUrl?: string | null; address: string }) {
  return property.zillowUrl || `https://www.zillow.com/homes/${encodeURIComponent(property.address)}_rb/`;
}

function valueStaleness(iso: string | null | undefined): { days: number | null; level: "fresh" | "aging" | "stale" | "never" } {
  if (!iso) return { days: null, level: "never" };
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 30) return { days, level: "fresh" };
  if (days < 90) return { days, level: "aging" };
  return { days, level: "stale" };
}

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
  const updateProperty = useUpdateProperty();
  const updateValue = useUpdateProperty();   // separate instance — never shares isPending with other mutations
  const runCalculator = useRunCalculator();

  // Inline current value editing via Popover
  const [valuePopoverOpen, setValuePopoverOpen] = useState(false);
  const [valueInput, setValueInput] = useState("");

  const handleSaveValue = () => {
    const raw = valueInput.trim().replace(/[$,\s]/g, "");
    const n = parseFloat(raw);
    if (!raw || isNaN(n) || n <= 0) {
      toast({ title: "Invalid value", description: "Please enter a number greater than zero.", variant: "destructive" });
      return;
    }
    updateValue.mutate({ id, data: { currentValue: n } }, {
      onSuccess: () => {
        setValuePopoverOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetPropertyQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetProjectionsQueryKey() });
        toast({ title: "Value updated", description: `Current value set to ${formatCurrency(n)}.` });
      },
      onError: () => toast({ title: "Error", description: "Failed to save value.", variant: "destructive" }),
    });
  };

  // View mode state
  const [viewMode, setViewMode] = useState<"all" | "current">("current");
  const currentRowRef = useRef<HTMLTableRowElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Monthly cash flow state (taxes, insurance, rent)
  const [taxesVal, setTaxesVal] = useState("");
  const [insuranceVal, setInsuranceVal] = useState("");
  const [rentVal, setRentVal] = useState("");
  const [cfEditing, setCfEditing] = useState<"taxes" | "insurance" | "rent" | null>(null);

  // Sync cash flow fields when property loads or changes
  useEffect(() => {
    if (property) {
      setTaxesVal(property.monthlyTaxes != null ? String(property.monthlyTaxes) : "");
      setInsuranceVal(property.monthlyInsurance != null ? String(property.monthlyInsurance) : "");
      setRentVal(property.monthlyRent != null ? String(property.monthlyRent) : "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property?.id]);

  const handleSaveCashFlow = (field: "taxes" | "insurance" | "rent") => {
    const map = {
      taxes:     { val: taxesVal,     key: "monthlyTaxes"     as const },
      insurance: { val: insuranceVal, key: "monthlyInsurance"  as const },
      rent:      { val: rentVal,      key: "monthlyRent"       as const },
    };
    const { val, key } = map[field];
    const n = parseFloat(val.replace(/[$,\s]/g, ""));
    const finalVal = isNaN(n) || n < 0 ? null : n;
    setCfEditing(null);
    updateProperty.mutate({ id, data: { [key]: finalVal } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetPropertyQueryKey(id) }),
    });
  };

  // Scenario state
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [extraMonthly, setExtraMonthly] = useState("");
  const [oneTimeExtras, setOneTimeExtras] = useState<OneTimeExtra[]>([{ paymentNumber: "", amount: "" }]);
  const [scenarioResult, setScenarioResult] = useState<ReturnType<typeof useRunCalculator>["data"] | null>(null);
  const [showingScenario, setShowingScenario] = useState(false);

  // Seed scenario inputs from saved extras when panel opens
  useEffect(() => {
    if (scenarioOpen && property) {
      if (property.savedExtraMonthly) setExtraMonthly(String(property.savedExtraMonthly));
      if (property.savedExtraPayments?.length) {
        setOneTimeExtras(
          property.savedExtraPayments.map(e => ({
            paymentNumber: String(e.paymentNumber),
            amount: String(e.amount),
          }))
        );
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioOpen]);

  const handleDelete = () => {
    deleteProperty.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Property Deleted", description: "The property has been removed." });
        queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetProjectionsQueryKey() });
        setLocation("/app/properties");
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
        toast({
          title: "Scenario calculated",
          description: `Save ${result.summary.monthsSaved} months and ${formatCurrency(result.summary.interestSaved)} in interest.`,
        });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to run scenario.", variant: "destructive" });
      },
    });
  };

  const handleApplyScenario = () => {
    if (!property || !scenarioResult) return;
    const validExtras = oneTimeExtras
      .filter(e => e.paymentNumber && e.amount && Number(e.amount) > 0)
      .map(e => ({ paymentNumber: Number(e.paymentNumber), amount: Number(e.amount) }));

    updateProperty.mutate({
      id,
      data: {
        savedExtraMonthly: extraMonthly ? Number(extraMonthly) : null,
        savedExtraPayments: validExtras.length > 0 ? validExtras : null,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPropertyQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetAmortizationScheduleQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetProjectionsQueryKey() });
        setShowingScenario(false);
        setScenarioOpen(false);
        toast({
          title: "Extra payments applied",
          description: "This property's schedule now reflects your extra payments.",
        });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to save extra payments.", variant: "destructive" });
      },
    });
  };

  const handleClearExtraPayments = () => {
    updateProperty.mutate({
      id,
      data: { savedExtraMonthly: null, savedExtraPayments: null },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPropertyQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetAmortizationScheduleQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetProjectionsQueryKey() });
        toast({ title: "Extra payments cleared", description: "Schedule reset to standard payments." });
      },
    });
  };

  const handleToggleAutoPay = (enabled: boolean) => {
    updateProperty.mutate({ id, data: { autoPayEnabled: enabled } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPropertyQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetProjectionsQueryKey() });
        toast({
          title: enabled ? "Auto-pay assumed" : "Auto-pay paused",
          description: enabled
            ? "All past payments are assumed made on schedule."
            : "Past payments are no longer assumed — equity reflects any missed months.",
        });
      },
    });
  };

  const clearScenario = () => {
    setScenarioResult(null);
    setShowingScenario(false);
    setExtraMonthly(property?.savedExtraMonthly ? String(property.savedExtraMonthly) : "");
    setOneTimeExtras(
      property?.savedExtraPayments?.length
        ? property.savedExtraPayments.map(e => ({ paymentNumber: String(e.paymentNumber), amount: String(e.amount) }))
        : [{ paymentNumber: "", amount: "" }]
    );
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

  // Current balance = amortized balance at today's payment number, not the final payoff row
  const currentBalanceRow = baseSchedule[currentPaymentNumber - 1];
  const currentBalance = currentBalanceRow?.remainingBalance ?? Number(property.loanAmount);
  const estimatedEquity = property.currentValue - currentBalance;

  const hasSavedExtras = property.savedExtraMonthly || property.savedExtraPayments?.length;
  const scenarioHasInputs = !!extraMonthly || oneTimeExtras.some(e => e.amount);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <Link href="/app/properties" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Properties
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{property.name}</h1>
          <div className="flex items-center gap-2 mt-2 text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span className="text-sm">{property.address}</span>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Auto-pay toggle */}
          <button
            type="button"
            onClick={() => handleToggleAutoPay(!property.autoPayEnabled)}
            disabled={updateProperty.isPending}
            title={property.autoPayEnabled ? "Click to mark payments as not all made" : "Click to assume all payments made on schedule"}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-all",
              property.autoPayEnabled
                ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400"
                : "bg-muted border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {property.autoPayEnabled
              ? <Zap className="w-3.5 h-3.5" />
              : <ZapOff className="w-3.5 h-3.5" />}
            {property.autoPayEnabled ? "Payments on track" : "Payments paused"}
          </button>

          <Button variant="outline" asChild>
            <Link href={`/app/properties/${id}/edit`}>
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

      {/* Auto-pay off warning */}
      {!property.autoPayEnabled && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Payments are marked as paused. The amortization schedule shows the theoretical projection — equity figures may differ from actual balance.
            <button
              onClick={() => handleToggleAutoPay(true)}
              className="ml-2 underline font-medium hover:no-underline"
            >
              Resume
            </button>
          </span>
        </div>
      )}

      {/* Saved extra payments banner */}
      {hasSavedExtras && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-primary/20 bg-primary/5 text-sm">
          <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="flex-1 text-foreground">
            <span className="font-medium">Extra payments applied:</span>{" "}
            {property.savedExtraMonthly ? `+${formatCurrency(property.savedExtraMonthly)}/month` : ""}
            {property.savedExtraMonthly && property.savedExtraPayments?.length ? " · " : ""}
            {property.savedExtraPayments?.length
              ? `${property.savedExtraPayments.length} one-time extra${property.savedExtraPayments.length > 1 ? "s" : ""}`
              : ""}
            {" — schedule reflects accelerated payoff."}
          </span>
          <button
            onClick={handleClearExtraPayments}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors underline whitespace-nowrap"
          >
            Clear
          </button>
        </div>
      )}

      {/* Stats Row */}
      {(() => {
        const stale = valueStaleness(property.valueLastUpdatedAt);
        const showNudge = stale.level !== "fresh";
        return showNudge ? (
          <div className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg border text-sm",
            stale.level === "stale"
              ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
              : "border-border bg-muted/40 text-muted-foreground"
          )}>
            <RefreshCw className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">
              {stale.level === "never"
                ? "Property value has never been refreshed — check Zillow and update it for accurate equity figures."
                : `Value last updated ${stale.days} day${stale.days === 1 ? "" : "s"} ago${stale.level === "stale" ? " — consider refreshing for accurate equity." : "."}`}
            </span>
            <a
              href={zillowUrl(property)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-background border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors whitespace-nowrap"
            >
              {property.zillowUrl ? "View on Zillow" : "Search on Zillow"}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ) : null;
      })()}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current Value — dialog edit */}
        <Card className="p-6 flex flex-col gap-2 relative overflow-hidden">
          <div className="flex justify-between items-start">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Current Value</h3>
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Update current value"
                className="text-muted-foreground/50 hover:text-primary transition-colors p-0.5 rounded"
                onClick={() => { setValueInput(String(property.currentValue)); setValuePopoverOpen(true); }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <Building className="w-5 h-5 text-muted-foreground/50" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-bold font-mono tracking-tight text-foreground">
              {formatCurrency(property.currentValue)}
            </span>
          </div>
          <div className="text-sm text-muted-foreground mt-auto pt-2">
            Bought {property.yearBought} for {formatCurrency(property.purchasePrice)}
          </div>
        </Card>

        {/* Update current value dialog */}
        <Dialog open={valuePopoverOpen} onOpenChange={setValuePopoverOpen}>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle>Update Current Value</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <Label htmlFor="current-value-input">New value ($)</Label>
              <Input
                id="current-value-input"
                type="text"
                inputMode="numeric"
                placeholder="e.g. 650000"
                value={valueInput}
                onChange={e => setValueInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSaveValue(); }}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setValuePopoverOpen(false)}>Cancel</Button>
              <Button type="button" onClick={handleSaveValue} disabled={updateValue.isPending}>
                {updateValue.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <StatCard
          title="Loan Amount"
          value={formatCurrency(property.loanAmount)}
          subtext={`${property.loanTermYears} yr @ ${property.interestRate}%`}
          icon={<DollarSign className="w-5 h-5 text-muted-foreground" />}
        />
        <StatCard
          title="Current Balance"
          value={formatCurrency(currentBalance)}
          subtext={`Payment #${currentPaymentNumber} of ${baseSchedule.length}`}
          icon={<Calendar className="w-5 h-5 text-muted-foreground" />}
        />
        <StatCard
          title="Estimated Equity"
          value={formatCurrency(estimatedEquity)}
          subtext={formatPercent(property.currentValue > 0 ? (estimatedEquity / property.currentValue) * 100 : 0) + " of value"}
          icon={<DollarSign className="w-5 h-5 text-muted-foreground" />}
        />
      </div>

      {/* Monthly Cash Flow Bar */}
      {(() => {
        const taxes     = parseFloat(taxesVal)     || 0;
        const insurance = parseFloat(insuranceVal) || 0;
        const rent      = parseFloat(rentVal)      || 0;
        const totalOut  = property.monthlyPayment + taxes + insurance;
        const net       = rent - totalOut;
        const hasRent   = rent > 0;

        type CfField = "taxes" | "insurance" | "rent";

        function EditableCell({
          field, label, prefix, value, setValue, placeholder, dimLabel,
        }: {
          field: CfField; label: string; prefix: string;
          value: string; setValue: (v: string) => void;
          placeholder: string; dimLabel?: string;
        }) {
          const isEditing = cfEditing === field;
          return (
            <div className="bg-muted/30 rounded-xl p-4 border border-border flex flex-col gap-1 relative group">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="font-medium text-muted-foreground/60">{prefix}</span> {label}
              </p>
              {isEditing ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-sm">$</span>
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    step="10"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onBlur={() => handleSaveCashFlow(field)}
                    onKeyDown={e => { if (e.key === "Enter") handleSaveCashFlow(field); if (e.key === "Escape") setCfEditing(null); }}
                    className="w-full bg-background border border-primary rounded px-2 py-0.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder={placeholder}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className={cn("text-lg font-bold", value ? "text-foreground" : "text-muted-foreground/40")}>
                    {value ? formatCurrency(parseFloat(value)) : "—"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCfEditing(field)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-primary p-0.5"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}
              {dimLabel && <p className="text-xs text-muted-foreground/50">{dimLabel}</p>}
            </div>
          );
        }

        return (
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-4">
                <Receipt className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Monthly Snapshot</h3>
                <span className="text-xs text-muted-foreground ml-auto">Hover a cell to edit · Schedule below is P&amp;I only</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">

                {/* Mortgage P&I — read-only */}
                <div className="bg-primary/5 rounded-xl p-4 border border-primary/20 flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">Mortgage P&amp;I</p>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(property.monthlyPayment)}</p>
                  <p className="text-xs text-muted-foreground/50">Fixed</p>
                </div>

                <EditableCell field="taxes"     label="Taxes"               prefix="+"  value={taxesVal}     setValue={setTaxesVal}     placeholder="0"   dimLabel="/mo" />
                <EditableCell field="insurance" label="Insurance &amp; Other" prefix="+"  value={insuranceVal} setValue={setInsuranceVal} placeholder="0"   dimLabel="/mo" />
                <EditableCell field="rent"      label="Rent Income"         prefix="−"  value={rentVal}      setValue={setRentVal}      placeholder="0"   dimLabel="/mo" />

                {/* Net cash flow */}
                <div className={cn(
                  "rounded-xl p-4 border flex flex-col gap-1",
                  !hasRent
                    ? "bg-muted/20 border-border"
                    : net >= 0
                    ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/40"
                    : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40",
                )}>
                  <p className="text-xs text-muted-foreground">Net / Month</p>
                  {hasRent ? (
                    <>
                      <div className="flex items-center gap-1">
                        {net >= 0
                          ? <TrendingUp className="w-3.5 h-3.5 text-green-600 dark:text-green-400 shrink-0" />
                          : <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                        <p className={cn(
                          "text-lg font-bold",
                          net >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400",
                        )}>
                          {net >= 0 ? "+" : ""}{formatCurrency(net)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground/50">
                        {net >= 0 ? "Cash flow positive" : "Cash flow negative"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-bold text-muted-foreground/40">—</p>
                      <p className="text-xs text-muted-foreground/50">Add rent to calculate</p>
                    </>
                  )}
                </div>
              </div>

              {/* Total out summary line */}
              {(taxes > 0 || insurance > 0) && (
                <p className="text-xs text-muted-foreground mt-3">
                  Total out: {formatCurrency(totalOut)}/mo
                  {hasRent && <> · Rent covers {((rent / totalOut) * 100).toFixed(0)}% of expenses</>}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Amortization + Scenario */}
      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Amortization Schedule</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {baseSchedule.length} payments &mdash; payoff {baseSchedule.length > 0 ? formatDate(baseSchedule[baseSchedule.length - 1].paymentDate) : "—"}
                {hasSavedExtras && (
                  <span className="ml-2 text-primary font-medium">(with extra payments)</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
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
              </div>

              <Button
                variant={scenarioOpen ? "default" : "outline"}
                size="sm"
                onClick={() => setScenarioOpen(!scenarioOpen)}
                data-testid="button-toggle-scenario"
              >
                {scenarioOpen ? <ChevronUp className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
                {hasSavedExtras ? "Edit Extra Payments" : "Try a Scenario"}
              </Button>
            </div>
          </div>

          {/* Scenario Panel */}
          {scenarioOpen && (
            <div className="rounded-xl border border-border bg-muted/30 p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm text-foreground">Extra Payment Scenario</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Run a what-if, then apply it permanently to this property's schedule.
                  </p>
                </div>
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

              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  onClick={handleRunScenario}
                  disabled={runCalculator.isPending || !scenarioHasInputs}
                  variant="outline"
                  data-testid="button-run-scenario"
                >
                  {runCalculator.isPending ? "Calculating..." : "Preview Scenario"}
                </Button>

                {scenarioResult && (
                  <Button
                    onClick={handleApplyScenario}
                    disabled={updateProperty.isPending}
                    className="gap-2"
                    data-testid="button-apply-scenario"
                  >
                    <Sparkles className="w-4 h-4" />
                    {updateProperty.isPending ? "Saving…" : "Apply to This Property"}
                  </Button>
                )}

                {hasSavedExtras && !scenarioResult && (
                  <button
                    onClick={handleClearExtraPayments}
                    className="text-xs text-muted-foreground hover:text-destructive underline"
                  >
                    Clear saved extra payments
                  </button>
                )}

                {showingScenario && (
                  <button
                    onClick={() => setShowingScenario(!showingScenario)}
                    className="text-xs text-muted-foreground hover:text-foreground underline ml-auto"
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
                  const hasExtra = base && base.paymentAmount > property.monthlyPayment + 1;

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
                        {base ? (
                          <span className={hasExtra ? "text-primary font-semibold" : ""}>
                            {formatCurrency(base.paymentAmount)}
                            {hasExtra && <span className="ml-1 text-xs opacity-70">+extra</span>}
                          </span>
                        ) : "—"}
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
