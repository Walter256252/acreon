import { useState } from "react";
import { useRunCalculator } from "@workspace/api-client-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import * as z from "zod";
import { formatCurrency, formatDate } from "@/lib/utils";

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
import { Calculator as CalcIcon, Plus, Trash2, CalendarClock, Target, ArrowDown } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Label } from "recharts";

const formSchema = z.object({
  loanAmount: z.coerce.number().min(1, "Required"),
  interestRate: z.coerce.number().min(0.01, "Required"),
  loanTermYears: z.coerce.number().min(1, "Required"),
  loanStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  monthlyPayment: z.coerce.number().min(1, "Required"),
  extraPaymentMonthly: z.coerce.number().optional(),
  extraPayments: z.array(z.object({
    paymentNumber: z.coerce.number().min(1),
    amount: z.coerce.number().min(1)
  })).max(5, "Maximum 5 one-time payments allowed")
});

export default function Calculator() {
  const runCalc = useRunCalculator();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      loanAmount: 300000,
      interestRate: 6.5,
      loanTermYears: 30,
      loanStartDate: new Date().toISOString().split('T')[0],
      monthlyPayment: 1896.20,
      extraPaymentMonthly: 0,
      extraPayments: []
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <CalcIcon className="w-8 h-8 text-primary" />
          What-If Calculator
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">See how extra payments affect your payoff timeline and interest.</p>
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
                    <FormField control={form.control} name="loanAmount" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Loan Amount ($)</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}/>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="interestRate" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Rate (%)</FormLabel>
                          <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}/>
                      <FormField control={form.control} name="loanTermYears" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Term (Yrs)</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}/>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="loanStartDate" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}/>
                      <FormField control={form.control} name="monthlyPayment" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Base P&I ($)</FormLabel>
                          <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}/>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t">
                    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Extra Payments</h3>
                    
                    <FormField control={form.control} name="extraPaymentMonthly" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monthly Extra ($)</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                        <FormDescription>Added to every payment</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}/>

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
                        <div key={field.id} className="flex items-end gap-2 bg-muted/30 p-2 rounded-md border border-border/50">
                          <FormField control={form.control} name={`extraPayments.${index}.paymentNumber`} render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel className="text-xs">Month No.</FormLabel>
                              <FormControl><Input type="number" className="h-8" {...field} /></FormControl>
                            </FormItem>
                          )}/>
                          <FormField control={form.control} name={`extraPayments.${index}.amount`} render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel className="text-xs">Amount ($)</FormLabel>
                              <FormControl><Input type="number" step="0.01" className="h-8" {...field} /></FormControl>
                            </FormItem>
                          )}/>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(index)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button type="submit" className="w-full" size="lg" disabled={runCalc.isPending}>
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
              <p className="mt-1 text-sm max-w-sm">Enter your loan details and proposed extra payments on the left, then click Calculate to see the projection.</p>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                  title="Total Interest"
                  value={formatCurrency(result.summary.totalInterest)}
                  icon={<ArrowDown className="w-5 h-5 text-muted-foreground" />}
                  trend={result.summary.interestSaved > 0 ? "up" : "neutral"}
                  trendValue={result.summary.interestSaved > 0 ? `Saved ${formatCurrency(result.summary.interestSaved)}` : undefined}
                />
                <StatCard
                  title="Payoff Date"
                  value={formatDate(result.summary.payoffDate)}
                  icon={<CalendarClock className="w-5 h-5 text-primary" />}
                  trend={result.summary.monthsSaved > 0 ? "up" : "neutral"}
                  trendValue={result.summary.monthsSaved > 0 ? `${Math.floor(result.summary.monthsSaved / 12)}y ${result.summary.monthsSaved % 12}m earlier` : undefined}
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
                          const isExtra = row.paymentAmount > basePayment + 1; // +1 to handle float rounding
                          
                          return (
                            <TableRow key={row.paymentNumber} className={isExtra ? "bg-primary/5" : ""}>
                              <TableCell className="font-mono text-xs text-muted-foreground">{row.paymentNumber}</TableCell>
                              <TableCell className="text-sm">{formatDate(row.paymentDate)}</TableCell>
                              <TableCell className={isExtra ? "text-right font-mono text-sm font-bold text-primary" : "text-right font-mono text-sm"}>
                                {formatCurrency(row.paymentAmount)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatCurrency(row.principalAmount)}</TableCell>
                              <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(row.interestAmount)}</TableCell>
                              <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(row.remainingBalance)}</TableCell>
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
