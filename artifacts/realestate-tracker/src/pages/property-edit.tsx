import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().min(1, "Address is required"),
  yearBought: z.coerce.number().min(1900, "Invalid year").max(new Date().getFullYear() + 1, "Year cannot be far in the future"),
  purchasePrice: z.coerce.number().min(0, "Must be positive"),
  currentValue: z.coerce.number().min(0, "Must be positive"),
  loanAmount: z.coerce.number().min(0, "Must be positive"),
  interestRate: z.coerce.number().min(0, "Must be positive").max(100, "Invalid rate"),
  loanTermYears: z.coerce.number().min(1, "Must be positive"),
  loanStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  monthlyPayment: z.coerce.number().min(0, "Must be positive"),
  notes: z.string().optional().nullable(),
  zillowUrl: z.string().url("Must be a valid URL").optional().nullable().or(z.literal("")),
});

export default function PropertyEdit() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: property, isLoading } = useGetProperty(id, { 
    query: { 
      enabled: !!id, 
      queryKey: getGetPropertyQueryKey(id) 
    } 
  });

  const form = useForm<z.infer<typeof formSchema>>({
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

  const updateProperty = useUpdateProperty();

  function onSubmit(values: z.infer<typeof formSchema>) {
    updateProperty.mutate({ id, data: { ...values, zillowUrl: values.zillowUrl || null } }, {
      onSuccess: () => {
        toast({
          title: "Property Updated",
          description: "Changes saved successfully.",
        });
        queryClient.invalidateQueries({ queryKey: getGetPropertyQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAmortizationScheduleQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetProjectionsQueryKey() });
        setLocation(`/app/properties/${id}`);
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to update property. Please try again.",
          variant: "destructive",
        });
      }
    });
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
        <Link href={`/app/properties/${id}`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Property
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Edit Property</h1>
        <p className="text-muted-foreground mt-1 text-sm">Update values to keep your dashboard accurate.</p>
      </div>

      <Card className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            
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
                        <Input type="number" step="0.01" {...field} />
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
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

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
                        <Input type="number" step="0.01" {...field} />
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
                      <FormLabel>Monthly Payment ($)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

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
                      Paste the exact Zillow listing page for this property. "Check on Zillow" buttons will link directly to it.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
              <Button type="submit" disabled={updateProperty.isPending} size="lg" className="w-full md:w-auto">
                {updateProperty.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </Card>
    </div>
  );
}
