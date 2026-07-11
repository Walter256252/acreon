import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { 
  useGetProperty, 
  getGetPropertyQueryKey,
  useGetAmortizationSchedule,
  getGetAmortizationScheduleQueryKey,
  useDeleteProperty,
  getGetDashboardQueryKey,
  getListPropertiesQueryKey,
  useLogPayment,
  useListPayments,
  getListPaymentsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatPercent, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { 
  ArrowLeft, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  MapPin, 
  Calendar,
  Building,
  DollarSign
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PropertyDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: property, isLoading: propLoading } = useGetProperty(id, { 
    query: { enabled: !!id, queryKey: getGetPropertyQueryKey(id) } 
  });
  
  const { data: schedule, isLoading: schedLoading } = useGetAmortizationSchedule(id, {
    query: { enabled: !!id, queryKey: getGetAmortizationScheduleQueryKey(id) }
  });

  const { data: payments } = useListPayments(id, {
    query: { enabled: !!id, queryKey: getListPaymentsQueryKey(id) }
  });

  const deleteProperty = useDeleteProperty();
  const logPayment = useLogPayment();

  const [isLogPaymentOpen, setIsLogPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [extraPayment, setExtraPayment] = useState<string>("0");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);

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
      }
    });
  };

  // Pre-fill payment amount when modal opens based on next unlogged row
  const handleOpenLogPayment = () => {
    if (schedule && schedule.length > 0) {
      const nextUnlogged = schedule.find(r => !r.isLogged);
      if (nextUnlogged) {
        setPaymentAmount(nextUnlogged.paymentAmount.toString());
      } else if (property) {
        setPaymentAmount(property.monthlyPayment.toString());
      }
    }
    setIsLogPaymentOpen(true);
  };

  const submitLogPayment = () => {
    if (!schedule || !property) return;
    
    const amount = Number(paymentAmount);
    const extra = Number(extraPayment);
    const nextUnlogged = schedule.find(r => !r.isLogged);
    
    if (!nextUnlogged) return;

    logPayment.mutate({
      id,
      data: {
        paymentDate,
        paymentAmount: amount,
        principalAmount: nextUnlogged.principalAmount,
        interestAmount: nextUnlogged.interestAmount,
        extraPayment: extra > 0 ? extra : undefined,
        remainingBalance: nextUnlogged.remainingBalance - extra,
        paymentNumber: nextUnlogged.paymentNumber
      }
    }, {
      onSuccess: () => {
        toast({ title: "Payment Logged", description: "Payment has been recorded." });
        setIsLogPaymentOpen(false);
        setExtraPayment("0");
        queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetAmortizationScheduleQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to log payment.", variant: "destructive" });
      }
    });
  };

  if (propLoading || schedLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-32 bg-muted animate-pulse rounded mb-4"></div>
        <div className="h-32 bg-muted animate-pulse rounded-xl"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl"></div>)}
        </div>
        <div className="h-96 bg-muted animate-pulse rounded-xl"></div>
      </div>
    );
  }

  if (!property) return <div className="p-8 text-center text-destructive font-bold">Property not found.</div>;

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
                  This action cannot be undone. This will permanently delete the property
                  and all associated payment records from your tracker.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete Property</AlertDialogAction>
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
          title="Est. Balance"
          value={schedule ? formatCurrency(schedule.find(r => !r.isLogged)?.remainingBalance ?? 0) : "..."}
          subtext="Based on schedule"
          icon={<Calendar className="w-5 h-5 text-muted-foreground" />}
        />
        <StatCard
          title="Monthly P&I"
          value={formatCurrency(property.monthlyPayment)}
          icon={<DollarSign className="w-5 h-5 text-muted-foreground" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content - Schedule */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl">Amortization Schedule</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Projected payoff timeline and interest breakdown</p>
              </div>
              <Dialog open={isLogPaymentOpen} onOpenChange={setIsLogPaymentOpen}>
                <DialogTrigger asChild>
                  <Button onClick={handleOpenLogPayment}>Log Payment</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Log Payment</DialogTitle>
                    <DialogDescription>
                      Record a payment made towards this mortgage.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="date">Date Paid</Label>
                      <Input id="date" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="amount">Base Payment Amount ($)</Label>
                      <Input id="amount" type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="extra">Extra Principal ($)</Label>
                      <Input id="extra" type="number" step="0.01" value={extraPayment} onChange={e => setExtraPayment(e.target.value)} />
                    </div>
                  </div>
                  <Button onClick={submitLogPayment} className="w-full" disabled={logPayment.isPending}>
                    {logPayment.isPending ? "Logging..." : "Confirm Payment"}
                  </Button>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border h-[600px] overflow-auto">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
                    <TableRow>
                      <TableHead className="w-[80px]">No.</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Payment</TableHead>
                      <TableHead className="text-right">Principal</TableHead>
                      <TableHead className="text-right">Interest</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Balance</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedule?.map((row) => (
                      <TableRow 
                        key={row.paymentNumber}
                        className={row.isLogged ? "bg-primary/5 hover:bg-primary/10 transition-colors" : ""}
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">{row.paymentNumber}</TableCell>
                        <TableCell className="text-sm">{formatDate(row.paymentDate)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(row.paymentAmount)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(row.principalAmount)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(row.interestAmount)}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(row.remainingBalance)}</TableCell>
                        <TableCell>
                          {row.isLogged && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Content - Info & History */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Property Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {property.notes ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{property.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No notes added.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payment History</CardTitle>
            </CardHeader>
            <CardContent>
              {(!payments || payments.length === 0) ? (
                <p className="text-sm text-muted-foreground italic">No payments logged yet.</p>
              ) : (
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {payments.slice().reverse().map((pay) => (
                    <div key={pay.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0">
                      <div>
                        <p className="font-medium">{formatDate(pay.paymentDate)}</p>
                        {pay.extraPayment && pay.extraPayment > 0 && (
                          <p className="text-xs text-primary">+{formatCurrency(pay.extraPayment)} extra</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-medium">{formatCurrency(pay.paymentAmount + (pay.extraPayment || 0))}</p>
                        <p className="text-xs text-muted-foreground font-mono">Bal: {formatCurrency(pay.remainingBalance)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
