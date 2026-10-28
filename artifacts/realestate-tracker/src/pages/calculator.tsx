import { useState } from "react";
import { useRunCalculator } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import * as z from "zod";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Calculator as CalcIcon,
  Plus,
  Trash2,
  CalendarClock,
  Target,
  ArrowDown,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Building2,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Label } from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────

interface Property {
  id: number;
  name: string;
  loanAmount: number;
  interestRate: number;
  monthlyPayment: number;
  currentValue: number;
}

// ── Form schema ────────────────────────────────────────────────────────────

const formSchema = z.object({
  loanAmount: z.coerce.number().min(1, "Required"),
  interestRate: z.coerce.number().min(0, "Cannot be negative"),
  loanTermYears: z.coerce.number().min(1, "Required"),
  loanStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  monthlyPayment: z.coerce.number().min(1, "Required"),
  extraPaymentMonthly: z.coerce.number().min(0).optional(),
  extraPayments: z
    .array(
      z.object({
        paymentNumber: z.coerce.number().int().min(1),
        amount: z.coerce.number().min(1),
      }),
    )
    .max(5, "Maximum 5 one-time payments allowed"),
});

// ── Portfolio impact panel ─────────────────────────────────────────────────

interface PortfolioImpactProps {
  loanAmount: number;
  interestRate: number;
  monthlyPayment: number;
  loanTermYears: number;
  totalInterest: number | null; // from calc result
  hasData: boolean;
  onClear: () => void;
}

function DeltaRow({
  label,
  before,
  after,
  format,
  highlight,
}: {
  label: string;
  before: string;
  after: string;
  format?: "up-bad" | "neutral";
  highlight?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-3 gap-2 py-2.5 text-sm border-b border-border last:border-0", highlight && "font-semibold")}>
      <span className="text-muted-foreground col-span-1">{label}</span>
      <span className="text-foreground text-right">{before}</span>
      <span className={cn("text-right", format === "up-bad" ? "text-orange-500 dark:text-orange-400" : "text-foreground")}>
        {after}
      </span>
    </div>
  );
}

function PortfolioImpact({ loanAmount, interestRate, monthlyPayment, loanTermYears, totalInterest, hasData, onClear }: PortfolioImpactProps) {
  const [open, setOpen] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const { data: properties = [], isLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    queryFn: () => fetch("/api/properties").then((r) => r.json()),
  });

  // Current portfolio totals
  const currentDebt      = properties.reduce((s, p) => s + (p.loanAmount ?? 0), 0);
  const currentMonthly   = properties.reduce((s, p) => s + (p.monthlyPayment ?? 0), 0);
  const currentValue     = properties.reduce((s, p) => s + (p.currentValue ?? 0), 0);
  const currentEquity    = currentValue - currentDebt;
  const currentAvgRate   =
    currentDebt > 0
      ? properties.reduce((s, p) => s + (Number(p.interestRate) || 0) * (Number(p.loanAmount) || 0), 0) / currentDebt
      : 0;

  // After adding this loan
  const newDebt     = currentDebt + loanAmount;
  const newMonthly  = currentMonthly + monthlyPayment;
  const newAvgRate  =
    newDebt > 0 && loanAmount > 0
      ? (currentAvgRate * currentDebt + Number(interestRate) * loanAmount) / newDebt
      : Number(currentAvgRate) || 0;
  const debtShare   = newDebt > 0 ? (loanAmount / newDebt) * 100 : 100;
  const rateDelta   = newAvgRate - currentAvgRate;

  const hasPortfolio = properties.length > 0;

  return (
    <Card className="border-primary/20">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left">
        <CardHeader className="bg-muted/30 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Portfolio Impact</CardTitle>
            </div>
            {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            How adding this property would shift your overall portfolio.
          </p>
        </CardHeader>
      </button>

      {open && (
        <CardContent className="pt-5 space-y-5">
          {!hasData ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Enter loan parameters and click <span className="font-medium text-foreground">Calculate Scenario</span> to see how this property would affect your portfolio.</p>
            </div>
          ) : isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}</div>
          ) : !hasPortfolio ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No existing properties to compare against.</p>
              <p className="text-xs mt-1">Add properties to your portfolio to see the impact here.</p>
            </div>
          ) : (
            <>
              {/* Key impact numbers */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Debt added */}
                <div className="rounded-xl border border-orange-200 dark:border-orange-900/40 bg-orange-50 dark:bg-orange-950/20 px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Debt added</p>
                  <p className="text-lg font-bold text-orange-600 dark:text-orange-400">+{formatCurrency(loanAmount)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{debtShare.toFixed(0)}% of new total</p>
                </div>
                {/* Monthly obligation */}
                <div className="rounded-xl border border-orange-200 dark:border-orange-900/40 bg-orange-50 dark:bg-orange-950/20 px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Monthly obligation</p>
                  <p className="text-lg font-bold text-orange-600 dark:text-orange-400">+{formatCurrency(monthlyPayment)}/mo</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {currentMonthly > 0 ? `${((monthlyPayment / currentMonthly) * 100).toFixed(0)}% increase` : "First property"}
                  </p>
                </div>
                {/* Rate shift */}
                <div className={cn(
                  "rounded-xl border px-4 py-3",
                  rateDelta > 0
                    ? "border-orange-200 dark:border-orange-900/40 bg-orange-50 dark:bg-orange-950/20"
                    : rateDelta < 0
                    ? "border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-950/20"
                    : "border-border bg-muted/30",
                )}>
                  <p className="text-xs text-muted-foreground mb-0.5">Avg. rate shift</p>
                  <div className="flex items-center gap-1">
                    {rateDelta > 0 ? (
                      <TrendingUp className="w-3.5 h-3.5 text-orange-500" />
                    ) : rateDelta < 0 ? (
                      <TrendingDown className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                    <p className={cn(
                      "text-lg font-bold",
                      rateDelta > 0 ? "text-orange-600 dark:text-orange-400" : rateDelta < 0 ? "text-green-600 dark:text-green-400" : "text-foreground",
                    )}>
                      {rateDelta === 0 ? "No change" : `${rateDelta > 0 ? "+" : ""}${rateDelta.toFixed(2)}%`}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {currentAvgRate.toFixed(2)}% → {newAvgRate.toFixed(2)}%
                  </p>
                </div>
                {/* Lifetime interest on this loan */}
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Lifetime interest cost</p>
                  <p className="text-lg font-bold text-foreground">
                    {totalInterest !== null ? formatCurrency(totalInterest) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {totalInterest !== null && loanAmount > 0
                      ? `${((totalInterest / loanAmount) * 100).toFixed(0)}% of loan principal`
                      : "Run calculator to see"}
                  </p>
                </div>
              </div>

              {/* Before / After table */}
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/40 px-4 py-2 grid grid-cols-3 gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Metric</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Before</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary text-right">After</span>
                </div>
                <div className="px-4">
                  <DeltaRow
                    label="Properties"
                    before={`${properties.length}`}
                    after={`${properties.length + 1}`}
                  />
                  <DeltaRow
                    label="Total debt"
                    before={formatCurrency(currentDebt)}
                    after={formatCurrency(newDebt)}
                    format="up-bad"
                    highlight
                  />
                  <DeltaRow
                    label="Monthly P&I"
                    before={formatCurrency(currentMonthly)}
                    after={formatCurrency(newMonthly)}
                    format="up-bad"
                  />
                  <DeltaRow
                    label="Wtd. avg rate"
                    before={`${currentAvgRate.toFixed(2)}%`}
                    after={`${newAvgRate.toFixed(2)}%`}
                    format={rateDelta > 0 ? "up-bad" : "neutral"}
                  />
                  {currentEquity > 0 && (
                    <DeltaRow
                      label="Portfolio equity"
                      before={formatCurrency(currentEquity)}
                      after="Updates after closing"
                      format="neutral"
                    />
                  )}
                </div>
              </div>

              {/* Per-property breakdown toggle */}
              <button
                type="button"
                onClick={() => setShowBreakdown((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
              >
                {showBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showBreakdown ? "Hide" : "Show"} existing property breakdown
              </button>

              {showBreakdown && (
                <div className="rounded-lg border border-border overflow-hidden animate-in fade-in duration-200">
                  <div className="divide-y divide-border">
                    {properties.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.interestRate}% rate</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium text-foreground">{formatCurrency(p.loanAmount)}</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(p.monthlyPayment)}/mo</p>
                        </div>
                        <div className="w-16 text-right shrink-0">
                          <p className="text-xs text-muted-foreground">{currentDebt > 0 ? `${((p.loanAmount / currentDebt) * 100).toFixed(0)}%` : "—"}</p>
                          <p className="text-xs text-muted-foreground/60">of debt</p>
                        </div>
                      </div>
                    ))}
                    {/* New property row */}
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-t-2 border-primary/20">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-primary truncate">This property <span className="text-xs font-normal text-muted-foreground">(new)</span></p>
                        <p className="text-xs text-muted-foreground">{interestRate}% rate · {loanTermYears}yr term</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium text-primary">{formatCurrency(loanAmount)}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(monthlyPayment)}/mo</p>
                      </div>
                      <div className="w-16 text-right shrink-0">
                        <p className="text-xs text-primary font-medium">{debtShare.toFixed(0)}%</p>
                        <p className="text-xs text-muted-foreground/60">of debt</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Clear */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={onClear}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear portfolio impact
                </button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function Calculator() {
  const runCalc = useRunCalculator();
  const [hasData, setHasData] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      loanAmount: 300000,
      interestRate: 6.5,
      loanTermYears: 30,
      loanStartDate: new Date().toISOString().split("T")[0],
      monthlyPayment: 1896.2,
      extraPaymentMonthly: 0,
      extraPayments: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    name: "extraPayments",
    control: form.control,
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    setHasData(true);
    runCalc.mutate({ data: values });
  }

  const result = runCalc.data;

  // Watch form fields to pass live values to the portfolio panel
  const watchedLoan      = Number(form.watch("loanAmount"))      || 0;
  const watchedRate      = Number(form.watch("interestRate"))     || 0;
  const watchedMonthly   = Number(form.watch("monthlyPayment"))   || 0;
  const watchedTermYears = Number(form.watch("loanTermYears"))    || 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <CalcIcon className="w-8 h-8 text-primary" />
          What-If Calculator
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          See how extra payments affect your payoff timeline and interest.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Input Form */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-primary/20 shadow-md lg:sticky lg:top-6">
            <CardHeader className="bg-muted/30 border-b">
              <CardTitle className="text-lg">Loan Parameters</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="loanAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Loan Amount ($)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="interestRate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Rate (%)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="loanTermYears"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Term (Yrs)</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="loanStartDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Payment Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="monthlyPayment"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Base P&I ($)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t">
                    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                      Extra Payments
                    </h3>

                    <FormField
                      control={form.control}
                      name="extraPaymentMonthly"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Monthly Extra ($)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} />
                          </FormControl>
                          <FormDescription>Added to every payment</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>One-Time Lumpsums</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => append({ paymentNumber: 12, amount: 5000 })}
                          disabled={fields.length >= 5}
                        >
                          <Plus className="w-3 h-3 mr-1" /> Add
                        </Button>
                      </div>

                      {fields.map((field, index) => (
                        <div
                          key={field.id}
                          className="flex items-end gap-2 bg-muted/30 p-2 rounded-md border border-border/50"
                        >
                          <FormField
                            control={form.control}
                            name={`extraPayments.${index}.paymentNumber`}
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <FormLabel className="text-xs">Month No.</FormLabel>
                                <FormControl>
                                  <Input type="number" className="h-8" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`extraPayments.${index}.amount`}
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <FormLabel className="text-xs">Amount ($)</FormLabel>
                                <FormControl>
                                  <Input type="number" step="0.01" className="h-8" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={runCalc.isPending}
                  >
                    {runCalc.isPending ? "Calculating..." : "Calculate Scenario"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

        </div>

        {/* Results Area */}
        <div className="lg:col-span-2 space-y-6">
          {!result ? (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-xl bg-muted/10 p-8 text-center">
              <CalcIcon className="w-16 h-16 opacity-20 mb-4" />
              <h3 className="text-lg font-medium text-foreground">Awaiting Parameters</h3>
              <p className="mt-1 text-sm max-w-sm">
                Enter your loan details and proposed extra payments on the left, then click Calculate to
                see the projection.
              </p>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                  title="Total Interest"
                  value={formatCurrency(result.summary.totalInterest)}
                  icon={<ArrowDown className="w-5 h-5 text-muted-foreground" />}
                  trend={result.summary.interestSaved > 0 ? "up" : "neutral"}
                  trendValue={
                    result.summary.interestSaved > 0
                      ? `Saved ${formatCurrency(result.summary.interestSaved)}`
                      : undefined
                  }
                />
                <StatCard
                  title="Payoff Date"
                  value={result.summary.payoffDate ? formatDate(result.summary.payoffDate) : "Not paid off within term"}
                  icon={<CalendarClock className="w-5 h-5 text-primary" />}
                  trend={result.summary.monthsSaved > 0 ? "up" : "neutral"}
                  trendValue={
                    result.summary.monthsSaved > 0
                      ? `${Math.floor(result.summary.monthsSaved / 12)}y ${result.summary.monthsSaved % 12}m earlier`
                      : undefined
                  }
                />
                <StatCard
                  title="Total Paid"
                  value={formatCurrency(result.schedule.reduce((sum, row) => sum + row.paymentAmount, 0))}
                  icon={<Target className="w-5 h-5 text-muted-foreground" />}
                />
              </div>

              {!result.summary.payoffDate && (
                <p className="text-sm text-destructive" role="status">
                  This payment plan does not repay the loan within the term. Remaining debt: {formatCurrency(result.summary.remainingBalance)}.
                  Savings are unavailable unless both plans repay the loan.
                </p>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>Projected Schedule</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border border-border h-[500px] overflow-auto">
                    <Table>
                      <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
                        <TableRow>
                          <TableHead className="w-[80px]">Mo.</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Total Pmt</TableHead>
                          <TableHead className="text-right">Principal</TableHead>
                          <TableHead className="text-right">Interest</TableHead>
                          <TableHead className="text-right font-semibold">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.schedule.map((row) => {
                          const basePayment = form.getValues().monthlyPayment;
                          const isExtra = row.paymentAmount > basePayment + 1;

                          return (
                            <TableRow
                              key={row.paymentNumber}
                              className={isExtra ? "bg-primary/5" : ""}
                            >
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {row.paymentNumber}
                              </TableCell>
                              <TableCell className="text-sm">{formatDate(row.paymentDate)}</TableCell>
                              <TableCell
                                className={
                                  isExtra
                                    ? "text-right font-mono text-sm font-bold text-primary"
                                    : "text-right font-mono text-sm"
                                }
                              >
                                {formatCurrency(row.paymentAmount)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatCurrency(row.principalAmount)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm text-muted-foreground">
                                {formatCurrency(row.interestAmount)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm font-semibold">
                                {formatCurrency(row.remainingBalance)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Portfolio Impact — full width, centered below the grid */}
      <div className="max-w-3xl mx-auto">
        <PortfolioImpact
          loanAmount={watchedLoan}
          interestRate={watchedRate}
          monthlyPayment={watchedMonthly}
          loanTermYears={watchedTermYears}
          totalInterest={result?.summary.totalInterest ?? null}
          hasData={hasData}
          onClear={() => setHasData(false)}
        />
      </div>
    </div>
  );
}
