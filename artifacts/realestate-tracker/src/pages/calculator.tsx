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
  Loader2,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Building2,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Label } from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────

interface Property {
  id: number;
  name: string;
  address: string;
  loanAmount: number;
  interestRate: number;
  loanTermYears: number;
  loanStartDate: string | null;
  monthlyPayment: number;
}

interface CalcSummary {
  monthsSaved: number;
  interestSaved: number;
  payoffDate: string;
  totalInterest: number;
  totalPayments: number;
}

interface PropertyImpact {
  property: Property;
  summary: CalcSummary | null;
  status: "loading" | "done" | "error";
}

// ── Form schema ────────────────────────────────────────────────────────────

const formSchema = z.object({
  loanAmount: z.coerce.number().min(1, "Required"),
  interestRate: z.coerce.number().min(0.01, "Required"),
  loanTermYears: z.coerce.number().min(1, "Required"),
  loanStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  monthlyPayment: z.coerce.number().min(1, "Required"),
  extraPaymentMonthly: z.coerce.number().optional(),
  extraPayments: z
    .array(
      z.object({
        paymentNumber: z.coerce.number().min(1),
        amount: z.coerce.number().min(1),
      }),
    )
    .max(5, "Maximum 5 one-time payments allowed"),
});

// ── Portfolio impact panel ─────────────────────────────────────────────────

function PortfolioImpact({
  extraPaymentMonthly,
  extraPayments,
}: {
  extraPaymentMonthly: number;
  extraPayments: { paymentNumber: number; amount: number }[];
}) {
  const [impacts, setImpacts] = useState<PropertyImpact[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(true);

  const { data: properties = [], isLoading: propsLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    queryFn: () => fetch("/api/properties").then((r) => r.json()),
  });

  const hasScenario = extraPaymentMonthly > 0 || extraPayments.length > 0;

  const handleAnalyze = async () => {
    if (!properties.length) return;
    setRunning(true);
    setHasRun(true);
    setImpacts(
      properties.map((p) => ({ property: p, summary: null, status: "loading" })),
    );

    const settled = await Promise.all(
      properties.map(async (p): Promise<PropertyImpact> => {
        try {
          const resp = await fetch("/api/calculator", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              loanAmount: p.loanAmount,
              interestRate: p.interestRate,
              loanTermYears: p.loanTermYears,
              loanStartDate: p.loanStartDate ?? new Date().toISOString().slice(0, 10),
              monthlyPayment: p.monthlyPayment,
              extraPaymentMonthly,
              extraPayments,
            }),
          });
          if (!resp.ok) throw new Error("calc failed");
          const data = await resp.json();
          return { property: p, summary: data.summary as CalcSummary, status: "done" };
        } catch {
          return { property: p, summary: null, status: "error" };
        }
      }),
    );

    setImpacts(settled.sort((a, b) => (b.summary?.interestSaved ?? 0) - (a.summary?.interestSaved ?? 0)));
    setRunning(false);
  };

  // Aggregate totals
  const doneImpacts = impacts.filter((i) => i.status === "done" && i.summary);
  const totalInterestSaved = doneImpacts.reduce((s, i) => s + (i.summary?.interestSaved ?? 0), 0);
  const avgMonthsSaved =
    doneImpacts.length > 0
      ? Math.round(doneImpacts.reduce((s, i) => s + (i.summary?.monthsSaved ?? 0), 0) / doneImpacts.length)
      : 0;
  const propertiesWithSavings = doneImpacts.filter((i) => (i.summary?.interestSaved ?? 0) > 0).length;

  return (
    <Card className="border-primary/20">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left"
      >
        <CardHeader className="bg-muted/30 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Portfolio Impact</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {doneImpacts.length > 0 && (
                <span className="text-xs text-primary font-medium bg-primary/10 px-2.5 py-0.5 rounded-full">
                  {formatCurrency(totalInterestSaved)} total saved
                </span>
              )}
              {open ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Apply these extra payments to every property in your portfolio and see the combined effect.
          </p>
        </CardHeader>
      </button>

      {open && (
        <CardContent className="pt-5 space-y-5">
          {/* Scenario hint */}
          {!hasScenario && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
              <TrendingDown className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Set a <strong>Monthly Extra</strong> or add a one-time lump sum in the form above, then analyze the portfolio impact below.
              </span>
            </div>
          )}

          {/* Scenario summary pill */}
          {hasScenario && (
            <div className="flex flex-wrap gap-2 text-sm">
              {extraPaymentMonthly > 0 && (
                <span className="bg-primary/10 text-primary px-3 py-1 rounded-full font-medium text-xs">
                  +{formatCurrency(extraPaymentMonthly)}/mo to every property
                </span>
              )}
              {extraPayments.map((ep, i) => (
                <span key={i} className="bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1 rounded-full font-medium text-xs">
                  {formatCurrency(ep.amount)} lump sum at payment #{ep.paymentNumber}
                </span>
              ))}
            </div>
          )}

          {/* Analyze button */}
          <Button
            type="button"
            onClick={handleAnalyze}
            disabled={!hasScenario || running || propsLoading || properties.length === 0}
            className="w-full"
            variant={hasRun ? "outline" : "default"}
          >
            {running ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing {properties.length} properties…</>
            ) : hasRun ? (
              <><BarChart3 className="w-4 h-4 mr-2" /> Re-analyze Portfolio</>
            ) : (
              <><BarChart3 className="w-4 h-4 mr-2" /> Analyze Portfolio Impact</>
            )}
          </Button>

          {/* Results */}
          {hasRun && !running && doneImpacts.length > 0 && (
            <div className="space-y-5 animate-in fade-in duration-300">
              {/* Aggregate stat strip */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-primary/5 border border-primary/15 px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Total interest saved</p>
                  <p className="text-xl font-bold text-primary">{formatCurrency(totalInterestSaved)}</p>
                </div>
                <div className="rounded-xl bg-muted/50 border border-border px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Avg. months cut</p>
                  <p className="text-xl font-bold text-foreground">
                    {avgMonthsSaved > 0 ? `${avgMonthsSaved} mo` : "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/50 border border-border px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Properties benefiting</p>
                  <p className="text-xl font-bold text-foreground">
                    {propertiesWithSavings}/{doneImpacts.length}
                  </p>
                </div>
              </div>

              {/* Per-property breakdown table */}
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/40 px-4 py-2.5 border-b border-border">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Per-property breakdown — sorted by interest saved
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {impacts.map((item, idx) => (
                    <div
                      key={item.property.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3",
                        idx === 0 && item.status === "done" ? "bg-primary/5" : "",
                      )}
                    >
                      {/* Rank */}
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                        idx === 0 && item.status === "done"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}>
                        {idx + 1}
                      </div>

                      {/* Property info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-tight">
                          {item.property.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.property.interestRate}% · {item.property.loanTermYears}yr
                        </p>
                      </div>

                      {/* Metrics */}
                      {item.status === "loading" && (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      )}
                      {item.status === "error" && (
                        <span className="text-xs text-destructive">Error</span>
                      )}
                      {item.status === "done" && item.summary && (
                        <div className="flex items-center gap-5 text-right">
                          <div className="hidden sm:block">
                            <p className="text-xs text-muted-foreground">Months saved</p>
                            <p className="text-sm font-semibold text-foreground">
                              {item.summary.monthsSaved > 0 ? `${item.summary.monthsSaved} mo` : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Interest saved</p>
                            <p className={cn(
                              "text-sm font-bold",
                              item.summary.interestSaved > 0 ? "text-primary" : "text-muted-foreground",
                            )}>
                              {item.summary.interestSaved > 0
                                ? formatCurrency(item.summary.interestSaved)
                                : "—"}
                            </p>
                          </div>
                          <div className="hidden md:block">
                            <p className="text-xs text-muted-foreground">New payoff</p>
                            <p className="text-sm font-medium text-foreground">
                              {formatDate(item.summary.payoffDate)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* No properties state */}
          {!propsLoading && properties.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No properties in your portfolio yet. Add one to see the impact here.
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function Calculator() {
  const runCalc = useRunCalculator();

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
    runCalc.mutate({ data: values });
  }

  const result = runCalc.data;

  // Watch extra payment fields to pass live values to the portfolio panel
  const watchedMonthly = form.watch("extraPaymentMonthly") ?? 0;
  const watchedLumps = form.watch("extraPayments") ?? [];

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
          <Card className="border-primary/20 shadow-md">
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
                            <FormLabel>Start Date</FormLabel>
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

          {/* Portfolio Impact panel — lives in the sidebar so it's always accessible */}
          <PortfolioImpact
            extraPaymentMonthly={Number(watchedMonthly) || 0}
            extraPayments={watchedLumps}
          />
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
                  value={formatDate(result.summary.payoffDate)}
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
                  value={formatCurrency(result.summary.totalPayments)}
                  icon={<Target className="w-5 h-5 text-muted-foreground" />}
                />
              </div>

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
    </div>
  );
}
