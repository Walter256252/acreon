import { useState, useCallback, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useLocation } from "wouter";
import {
  useCreateProperty,
  useBulkImportProperties,
  getListPropertiesQueryKey,
  getGetDashboardQueryKey,
  getGetProjectionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

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
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileSpreadsheet, PlusCircle, Upload, X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

// ─── Manual form ────────────────────────────────────────────────────────────

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
  currentLoanBalance: z.coerce.number().min(0, "Must be positive").optional(),
  notes: z.string().optional(),
  zillowUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

// ─── Spreadsheet import helpers ──────────────────────────────────────────────

type FieldKey =
  | "name"
  | "address"
  | "yearBought"
  | "purchasePrice"
  | "currentValue"
  | "loanAmount"
  | "interestRate"
  | "loanTermYears"
  | "loanStartDate"
  | "monthlyPayment"
  | "notes";

const FIELD_ALIASES: Record<FieldKey, string[]> = {
  name: ["name", "property name", "property", "nickname", "title", "unit", "label"],
  address: ["address", "property address", "location", "street", "full address", "street address"],
  yearBought: [
    "year bought", "year purchased", "purchase year", "year acquired",
    "year", "bought year", "year of purchase",
  ],
  purchasePrice: [
    "purchase price", "bought for", "original price", "cost", "acquisition cost",
    "purchase cost", "original value", "buy price", "acquisition price",
  ],
  currentValue: [
    "current value", "market value", "estimated value", "value", "appraisal",
    "current market value", "fair market value", "fmv", "estimated market value",
    "current estimated value",
  ],
  loanAmount: [
    "loan amount", "mortgage amount", "original loan", "principal",
    "mortgage balance", "loan balance", "original balance", "loan principal",
    "original mortgage", "initial loan",
  ],
  interestRate: [
    "interest rate", "rate", "apr", "rate %", "interest %",
    "mortgage rate", "annual rate", "loan rate",
  ],
  loanTermYears: [
    "loan term", "term years", "term (years)", "years", "term",
    "mortgage term", "loan duration", "amortization period",
  ],
  loanStartDate: [
    "loan start date", "start date", "closing date", "close date",
    "loan date", "origination date", "mortgage start", "loan start",
  ],
  monthlyPayment: [
    "monthly payment", "payment", "p&i", "monthly p&i", "mortgage payment",
    "monthly mortgage", "mo payment", "monthly", "payment amount",
  ],
  notes: ["notes", "comments", "description", "memo", "remarks", "note", "additional info"],
};

function normalise(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9&]/g, " ").replace(/\s+/g, " ").trim();
}

function matchColumns(headers: string[]): Record<FieldKey, number | null> {
  const mapping = {} as Record<FieldKey, number | null>;
  for (const field of Object.keys(FIELD_ALIASES) as FieldKey[]) {
    mapping[field] = null;
    const aliases = FIELD_ALIASES[field];
    for (let i = 0; i < headers.length; i++) {
      const h = normalise(headers[i]);
      if (aliases.some((alias) => h === alias || h.includes(alias) || alias.includes(h))) {
        mapping[field] = i;
        break;
      }
    }
  }
  return mapping;
}

/** Parse an Excel serial date number OR a date string into YYYY-MM-DD */
function toDateString(val: unknown): string {
  if (val === null || val === undefined || val === "") return new Date().toISOString().split("T")[0];
  if (typeof val === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      const mm = String(d.m).padStart(2, "0");
      const dd = String(d.d).padStart(2, "0");
      return `${d.y}-${mm}-${dd}`;
    }
  }
  const s = String(val);
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY or DD/MM/YYYY — try both
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
    // assume MM/DD/YYYY
    return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  }
  return new Date().toISOString().split("T")[0];
}

function toNum(val: unknown, fallback = 0): number {
  if (val === null || val === undefined || val === "") return fallback;
  const n = Number(String(val).replace(/[$,\s%]/g, ""));
  return isNaN(n) ? fallback : n;
}

function toYear(val: unknown): number {
  const n = toNum(val, new Date().getFullYear());
  // If someone put a date like 2019-01-01, grab the year
  if (n > 3000) return new Date().getFullYear(); // clearly wrong
  return Math.round(n);
}

export interface ParsedRow {
  name: string;
  address: string;
  yearBought: number;
  purchasePrice: number;
  currentValue: number;
  loanAmount: number;
  interestRate: number;
  loanTermYears: number;
  loanStartDate: string;
  monthlyPayment: number;
  notes?: string;
}

function parseSheet(
  rows: unknown[][],
  headers: string[],
  mapping: Record<FieldKey, number | null>
): ParsedRow[] {
  return rows.map((row) => {
    const get = (field: FieldKey) => (mapping[field] !== null ? row[mapping[field]!] : undefined);
    return {
      name: String(get("name") ?? "Untitled Property"),
      address: String(get("address") ?? ""),
      yearBought: toYear(get("yearBought")),
      purchasePrice: toNum(get("purchasePrice")),
      currentValue: toNum(get("currentValue")),
      loanAmount: toNum(get("loanAmount")),
      interestRate: toNum(get("interestRate")),
      loanTermYears: Math.round(toNum(get("loanTermYears"), 30)),
      loanStartDate: toDateString(get("loanStartDate")),
      monthlyPayment: toNum(get("monthlyPayment")),
      notes: get("notes") ? String(get("notes")) : undefined,
    };
  });
}

// ─── Import panel component ─────────────────────────────────────────────────

interface ImportResult {
  imported: number;
  failed: number;
  errors: { row: number; message: string }[];
}

function SpreadsheetImport({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bulkImport = useBulkImportProperties();

  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, number | null> | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
        if (raw.length < 2) {
          toast({ title: "Empty sheet", description: "The spreadsheet has no data rows.", variant: "destructive" });
          return;
        }
        const hdrs = (raw[0] as unknown[]).map((h) => String(h));
        const dataRows = raw.slice(1).filter((r) => r.some((c) => c !== "" && c !== null && c !== undefined));
        const mp = matchColumns(hdrs);
        setHeaders(hdrs);
        setMapping(mp);
        setRows(parseSheet(dataRows, hdrs, mp));
      } catch {
        toast({ title: "Parse error", description: "Couldn't read that file. Try saving as .xlsx or .csv.", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
  }, [toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleImport = () => {
    if (!rows.length) return;
    bulkImport.mutate(
      { data: { properties: rows } },
      {
        onSuccess: (res) => {
          setResult(res);
          queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        },
        onError: () => {
          toast({ title: "Import failed", description: "Something went wrong. Please try again.", variant: "destructive" });
        },
      }
    );
  };

  const reset = () => {
    setFileName(null);
    setHeaders([]);
    setMapping(null);
    setRows([]);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const mappedCount = mapping ? Object.values(mapping).filter((v) => v !== null).length : 0;

  // ── Success state
  if (result) {
    return (
      <Card className="p-8 text-center space-y-4">
        <div className="flex justify-center">
          <CheckCircle2 className="w-12 h-12 text-green-500" />
        </div>
        <div>
          <h3 className="text-xl font-semibold">{result.imported} {result.imported === 1 ? "property" : "properties"} imported</h3>
          {result.failed > 0 && (
            <p className="text-sm text-muted-foreground mt-1">{result.failed} row{result.failed > 1 ? "s" : ""} couldn't be imported</p>
          )}
        </div>
        {result.errors.length > 0 && (
          <div className="text-left space-y-1 max-h-40 overflow-y-auto">
            {result.errors.map((err) => (
              <div key={err.row} className="flex items-start gap-2 text-xs text-destructive">
                <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>Row {err.row}: {err.message}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <Button variant="outline" onClick={reset}>Import another file</Button>
          <Button onClick={onDone}>Go to Properties</Button>
        </div>
      </Card>
    );
  }

  // ── Drop zone (no file yet)
  if (!fileName) {
    return (
      <Card
        className={cn(
          "border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer",
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileInput} />
        <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-1">Drop your spreadsheet here</h3>
        <p className="text-sm text-muted-foreground mb-4">Accepts .xlsx, .xls, or .csv — any layout, we'll figure it out</p>
        <Button variant="outline" type="button" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
          <Upload className="w-4 h-4 mr-2" />
          Browse files
        </Button>

        <div className="mt-8 border-t pt-6">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">We look for columns like</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {["Property Name", "Address", "Purchase Price", "Current Value", "Loan Amount", "Interest Rate", "Loan Term", "Monthly Payment", "Loan Start Date"].map((label) => (
              <Badge key={label} variant="secondary" className="text-xs">{label}</Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Column names don't need to match exactly — we'll do our best to map them.</p>
        </div>
      </Card>
    );
  }

  // ── Preview table
  return (
    <div className="space-y-4">
      {/* File header */}
      <Card className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground">
              {rows.length} {rows.length === 1 ? "row" : "rows"} detected
              {" · "}
              {mappedCount} of {Object.keys(FIELD_ALIASES).length} fields mapped
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={reset}>
          <X className="w-4 h-4" />
        </Button>
      </Card>

      {/* Column mapping status */}
      {mapping && (
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Column mapping</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {(Object.keys(FIELD_ALIASES) as FieldKey[]).map((field) => {
              const colIdx = mapping[field];
              const colName = colIdx !== null ? headers[colIdx] : null;
              const required = !["notes"].includes(field);
              return (
                <div key={field} className="flex items-center gap-2 text-xs">
                  {colName ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  ) : (
                    <div className={cn("w-3.5 h-3.5 rounded-full border-2 flex-shrink-0", required ? "border-amber-400" : "border-muted-foreground/30")} />
                  )}
                  <span className="text-muted-foreground">{field}:</span>
                  <span className={colName ? "font-medium text-foreground" : "text-muted-foreground/50 italic"}>
                    {colName ?? (required ? "not found" : "—")}
                  </span>
                </div>
              );
            })}
          </div>
          {mappedCount < 5 && (
            <p className="text-xs text-amber-600 mt-3 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Only {mappedCount} fields were auto-detected. Missing fields will default to 0. You can edit each property after importing.
            </p>
          )}
        </Card>
      )}

      {/* Preview table */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <p className="text-sm font-semibold">Preview — first {Math.min(rows.length, 5)} of {rows.length}</p>
          <p className="text-xs text-muted-foreground">Review before confirming</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                {["Name", "Address", "Yr", "Purchase $", "Value $", "Loan $", "Rate %", "Term", "Monthly $"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.slice(0, 5).map((row, i) => (
                <tr key={i} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium max-w-[140px] truncate">{row.name}</td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[160px] truncate">{row.address || <span className="italic opacity-50">empty</span>}</td>
                  <td className="px-3 py-2">{row.yearBought}</td>
                  <td className="px-3 py-2">{row.purchasePrice.toLocaleString()}</td>
                  <td className="px-3 py-2">{row.currentValue.toLocaleString()}</td>
                  <td className="px-3 py-2">{row.loanAmount.toLocaleString()}</td>
                  <td className="px-3 py-2">{row.interestRate}</td>
                  <td className="px-3 py-2">{row.loanTermYears}yr</td>
                  <td className="px-3 py-2">{row.monthlyPayment.toLocaleString()}</td>
                </tr>
              ))}
              {rows.length > 5 && (
                <tr>
                  <td colSpan={9} className="px-3 py-2 text-center text-muted-foreground">
                    + {rows.length - 5} more rows not shown
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={reset}>
          <X className="w-4 h-4 mr-2" />
          Choose different file
        </Button>
        <Button onClick={handleImport} disabled={bulkImport.isPending || rows.length === 0} size="lg">
          {bulkImport.isPending ? "Importing…" : `Import ${rows.length} ${rows.length === 1 ? "Property" : "Properties"}`}
        </Button>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function PropertyNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"manual" | "import">("manual");
  const [knowCurrentBalance, setKnowCurrentBalance] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      address: "",
      yearBought: new Date().getFullYear(),
      purchasePrice: 0,
      currentValue: 0,
      loanAmount: 0,
      interestRate: 6.5,
      loanTermYears: 30,
      loanStartDate: new Date().toISOString().split("T")[0],
      monthlyPayment: 0,
      notes: "",
      zillowUrl: "",
    },
  });

  const createProperty = useCreateProperty();

  function onSubmit(values: z.infer<typeof formSchema>) {
    createProperty.mutate({ data: { ...values, zillowUrl: values.zillowUrl || undefined } }, {
      onSuccess: (property) => {
        toast({ title: "Property Added", description: "Successfully added to your portfolio." });
        queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetProjectionsQueryKey() });
        setLocation(`/properties/${property.id}`);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to add property. Please try again.", variant: "destructive" });
      },
    });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div>
        <Link href="/app" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Add Property</h1>
        <p className="text-muted-foreground mt-1 text-sm">Add a single property manually, or upload a spreadsheet to import several at once.</p>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setTab("manual")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
            tab === "manual"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <PlusCircle className="w-4 h-4" />
          Add Manually
        </button>
        <button
          type="button"
          onClick={() => setTab("import")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
            tab === "import"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Import from Spreadsheet
        </button>
      </div>

      {/* Manual form */}
      {tab === "manual" && (
        <Card className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">Property Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Property Name</FormLabel>
                      <FormControl><Input placeholder="e.g. Primary Residence" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="address" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl><Input placeholder="123 Main St, City, ST" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="yearBought" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Year Bought</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="purchasePrice" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purchase Price ($)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="currentValue" render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Current Estimated Value ($)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormDescription>Update this over time to track equity accurately.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">Mortgage Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="loanAmount" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Original Loan Amount ($)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="interestRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interest Rate (%)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="loanTermYears" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loan Term (Years)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="loanStartDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loan Start Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormDescription>Format: YYYY-MM-DD</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="monthlyPayment" render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Monthly Payment ($)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormDescription>Principal + Interest (exclude taxes/insurance if you want pure debt tracking)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Current balance toggle */}
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={knowCurrentBalance}
                      onChange={e => {
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
                    Use this if you bought the property years ago and have already paid down some principal — the amortization schedule will start from this balance today instead of replaying the full loan history.
                  </p>
                  {knowCurrentBalance && (
                    <div className="pl-7">
                      <FormField control={form.control} name="currentLoanBalance" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Remaining Balance ($)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="e.g. 187000"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormDescription>
                            What your lender shows you owe right now — also update the Loan Start Date above to today so payment #1 is dated correctly.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  )}
                </div>
              </div>


              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">Zillow Listing</h3>
                <FormField control={form.control} name="zillowUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zillow Listing URL <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input type="url" placeholder="https://www.zillow.com/homedetails/..." {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormDescription>
                      Paste the exact Zillow listing URL — the "Check Zillow listing" button on the property page will link directly to it.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">Notes</h3>
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea placeholder="Any context about the loan or property..." className="resize-y" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={createProperty.isPending} size="lg" className="w-full md:w-auto">
                  {createProperty.isPending ? "Adding..." : "Add Property"}
                </Button>
              </div>
            </form>
          </Form>
        </Card>
      )}

      {/* Spreadsheet import */}
      {tab === "import" && (
        <SpreadsheetImport onDone={() => setLocation("/app/properties")} />
      )}
    </div>
  );
}
