import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { useLocation, useParams } from "wouter";
import {
  useGetProperty,
  getGetPropertyQueryKey,
  useUpdateProperty,
  getListPropertiesQueryKey,
  getGetDashboardQueryKey,
  getGetAmortizationScheduleQueryKey,
  getGetProjectionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Info } from "lucide-react";
import { Link } from "wouter";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip currency/percent symbols and commas before number coercion */
function stripCurrency(val: unknown): unknown {
  if (val === null || val === undefined || val === "") return val;
  if (typeof val === "string") return val.replace(/[$,%\s]/g, "");
  return val;
}

/** Standard mortgage P&I formula */
function computePI(loanAmount: number, interestRate: number, loanTermYears: number): number {
  const r = interestRate / 100 / 12;
  const n = loanTermYears * 12;
  if (!r || !n || loanAmount <= 0) return 0;
  return (loanAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/** Remaining loan balance based on loan parameters and elapsed time */
function computeRemainingBalance(
  loanAmount: number,
  interestRate: number,
  loanTermYears: number,
  loanStartDate: string,
): number {
  const r = interestRate / 100 / 12;
  const n = loanTermYears * 12;
  const start = new Date(loanStartDate);
  const now = new Date();
  const monthsElapsed =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());

  if (monthsElapsed <= 0) return loanAmount;
  if (monthsElapsed >= n) return 0;
  if (!r) return Math.max(0, loanAmount - (loanAmount / n) * monthsElapsed);

  const M = computePI(loanAmount, interestRate, loanTermYears);
  const remaining =
    loanAmount * Math.pow(1 + r, monthsElapsed) - (M * (Math.pow(1 + r, monthsElapsed) - 1)) / r;
  return Math.max(0, Math.round(remaining * 100) / 100);
}

// ── Schema ────────────────────────────────────────────────────────────────────

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().min(1, "Address is required"),
  yearBought: z.coerce
    .number()
    .min(1900, "Invalid year")
    .max(new Date().getFullYear() + 1, "Year cannot be far in the future"),
  purchasePrice: z.preprocess(stripCurrency, z.coerce.number().min(0, "Must be positive")),
  currentValue: z.preprocess(stripCurrency, z.coerce.number().min(0, "Must be positive")),
  loanAmount: z.preprocess(stripCurrency, z.coerce.number().min(0, "Must be positive")),
  interestRate: z.preprocess(
    stripCurrency,
    z.coerce.number().min(0, "Must be positive").max(100, "Invalid rate"),
  ),
  loanTermYears: z.coerce.number().min(1, "Must be positive"),
  loanStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  monthlyPayment: z.preprocess(stripCurrency, z.coerce.number().min(0, "Must be positive")),
  currentLoanBalance: z.preprocess(stripCurrency, z.coerce.number().min(0, "Must be positive"))
    .optional()
    .nullable(),
  notes: z.string().optional().nullable(),
  zillowUrl: z.string().url("Must be a valid URL").optional().nullable().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

// ── Component ─────────────────────────────────────────────────────────────────

export default function PropertyEdit() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [knowCurrentBalance, setKnowCurrentBalance] = useState(false);

  const { data: property, isLoading } = useGetProperty(id, {
    query: { enabled: !!id, queryKey: getGetPropertyQueryKey(id) },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      address: "",
      yearBought: new Date().getFullYear(),
      purchasePrice: 0,
      currentValue: 0,
      loanAmount: 0,
      interestRate: 0,
      loanTermYears: 30,
      loanStartDate: "",
      monthlyPayment: 0,
      currentLoanBalance: undefined,
      notes: "",
    },
  });

  useEffect(() => {
    if (property) {
      form.reset({
        name: property.name,
        address: property.address,
        yearBought: property.yearBought,
        purchasePrice: property.purchasePrice,
        currentValue: property.currentValue,
        loanAmount: property.loanAmount,
        interestRate: property.interestRate,
        loanTermYears: property.loanTermYears,
        loanStartDate: property.loanStartDate,
        monthlyPayment: property.monthlyPayment,
        notes: property.notes || "",
        zillowUrl: property.zillowUrl || "",
      });
    }
  }, [property, form]);

  // Auto-compute P&I when loan params change
  const watchedLoan = useWatch({ control: form.control, name: "loanAmount" });
  const watchedRate = useWatch({ control: form.control, name: "interestRate" });
  const watchedTerm = useWatch({ control: form.control, name: "loanTermYears" });

  useEffect(() => {
    const loan = Number(String(watchedLoan).replace(/[$,\s]/g, "")) || 0;
    const rate = Number(String(watchedRate).replace(/[$,%\s]/g, "")) || 0;
    const term = Number(watchedTerm) || 0;
    if (loan > 0 && rate > 0 && term > 0) {
      const pi = computePI(loan, rate, term);
      form.setValue("monthlyPayment", Math.round(pi * 100) / 100, { shouldDirty: false });
    }
  }, [watchedLoan, watchedRate, watchedTerm, form]);

  const updateProperty = useUpdateProperty();

  function onSubmit(values: FormValues) {
    let balanceToSend: number | null = null;

    if (knowCurrentBalance && values.currentLoanBalance != null && values.currentLoanBalance > 0) {
      balanceToSend = values.currentLoanBalance;
    } else {
      // Compute remaining balance from loan parameters
      const loan = Number(String(values.loanAmount).replace(/[$,\s]/g, "")) || 0;
      const rate = Number(String(values.interestRate).replace(/[$,%\s]/g, "")) || 0;
      const term = Number(values.loanTermYears) || 0;
      const startDate = values.loanStartDate;
      if (loan > 0 && rate > 0 && term > 0 && startDate) {
        balanceToSend = computeRemainingBalance(loan, rate, term, startDate);
      }
    }

    updateProperty.mutate(
      {
        id,
        data: {
          ...values,
          currentLoanBalance: balanceToSend,
          zillowUrl: values.zillowUrl || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Property Updated", description: "Changes saved successfully." });
          queryClient.invalidateQueries({ queryKey: getGetPropertyQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAmortizationScheduleQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetProjectionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["properties-geo-user"] });
          queryClient.invalidateQueries({ queryKey: ["occupancy"] });
          setLocation(`/app/properties/${id}`);
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to update property. Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-4"></div>
        <div className="h-[600px] bg-muted animate-pulse rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div>
        <Link
          href={`/app/properties/${id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Property
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Edit Property</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Update values to keep your dashboard accurate.
        </p>
      </div>

      <Card className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* ── Property Details ───────────────────────────────────────── */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">Property Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Property Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="yearBought"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Year Bought</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="purchasePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purchase Price ($)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          placeholder="e.g. 450,000"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="currentValue"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Current Estimated Value ($)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          placeholder="e.g. 520,000"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormDescription>
                        Update this over time to track equity accurately.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* ── Mortgage Details ───────────────────────────────────────── */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">Mortgage Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="loanAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Original Loan Amount ($)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          placeholder="e.g. 360,000"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="interestRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interest Rate (%)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          placeholder="e.g. 6.5"
                          {...field}
                          value={field.value ?? ""}
                        />
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
                      <FormLabel>Loan Term (Years)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="loanStartDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loan Start Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormDescription>Format: YYYY-MM-DD</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="monthlyPayment"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Monthly P&amp;I ($)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          placeholder="Auto-calculated from loan details"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormDescription>
                        Principal + Interest — auto-calculated from your loan details above. Edit to override.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* ── Current balance toggle ──────────────────────────────── */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={knowCurrentBalance}
                    onChange={(e) => {
                      setKnowCurrentBalance(e.target.checked);
                      if (!e.target.checked) form.setValue("currentLoanBalance", undefined);
                    }}
                    className="w-4 h-4 accent-primary rounded"
                  />
                  <span className="text-sm font-medium text-foreground">
                    I know my current remaining balance
                  </span>
                </label>
                <p className="text-xs text-muted-foreground flex items-start gap-1.5 pl-7">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  If unchecked, your remaining balance is automatically calculated from the loan
                  parameters above. Check this to enter what your lender shows as today's exact
                  balance.
                </p>
                {knowCurrentBalance && (
                  <div className="pl-7">
                    <FormField
                      control={form.control}
                      name="currentLoanBalance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Remaining Balance ($)</FormLabel>
                          <FormControl>
                            <Input
                              inputMode="decimal"
                              placeholder="e.g. 187,000"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormDescription>
                            What your lender shows you owe right now — used as the starting point
                            for the amortization schedule and debt calculations.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ── Valuation ──────────────────────────────────────────────── */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">Valuation</h3>
              <FormField
                control={form.control}
                name="zillowUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zillow Listing URL</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://www.zillow.com/homes/..."
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Paste the exact Zillow listing page for this property. "Check on Zillow"
                      buttons will link directly to it.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Notes ─────────────────────────────────────────────────── */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">Notes</h3>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="Any context about the loan or property..."
                        className="resize-y"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                disabled={updateProperty.isPending}
                size="lg"
                className="w-full md:w-auto"
              >
                {updateProperty.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </Card>
    </div>
  );
}
