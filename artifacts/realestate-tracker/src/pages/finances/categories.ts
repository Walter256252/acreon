// ── Shared category definitions for the Finances module ──────────────────

export type TxType =
  | "income"
  | "expense"
  | "loan_payment"
  | "owner_contribution"
  | "owner_draw"
  | "capital_improvement";

export const TX_TYPE_LABELS: Record<TxType, string> = {
  income: "Income",
  expense: "Expense",
  loan_payment: "Loan Payment",
  owner_contribution: "Owner Contribution",
  owner_draw: "Owner Draw",
  capital_improvement: "Capital Improvement",
};

export const INCOME_CATEGORIES = [
  // Long-term rental
  "Rental Income",
  "Late Fees",
  "Pet Fees",
  "Parking Income",
  "Laundry Income",
  "Storage Income",
  "Application Fees",
  "Utility Reimbursements",
  "Other Rental Income",
  // Short-term rental
  "Nightly Revenue",
  "Cleaning Fees Charged",
  "Extra Guest Fees",
  "Early Check-in / Late Checkout Fees",
  "Damage Reimbursements",
  "Airbnb Payout",
  "VRBO Payout",
  "Booking.com Payout",
  "Direct Booking Income",
  "Other STR Income",
] as const;

export const EXPENSE_CATEGORIES = [
  "Advertising & Marketing",
  "Auto & Travel",
  "Bank Fees",
  "Cleaning & Turnover",
  "Commissions",
  "HOA / Condo Fees",
  "Insurance",
  "Internet",
  "Landscaping",
  "Legal & Professional Fees",
  "Licensing & Permits",
  "Management Fees",
  "Merchant & Processing Fees",
  "Mortgage Interest",
  "Office Expenses",
  "Pest Control",
  "Property Taxes",
  "Repairs",
  "Maintenance",
  "Security",
  "Software & Subscriptions",
  "Supplies",
  "Telephone",
  "Utilities",
  "Water & Sewer",
  "Electricity",
  "Gas",
  "Trash",
  "Snow Removal",
  "STR Platform Fees",
  "Other Expenses",
] as const;

export const LOAN_PAYMENT_CATEGORIES = [
  "Mortgage Payment (Combined)",
  "Principal",
  "Interest",
  "Escrow",
  "PMI",
  "Loan Fees",
] as const;

export const CAPITAL_IMPROVEMENT_CATEGORIES = [
  "Roof",
  "HVAC",
  "Plumbing",
  "Electrical",
  "Windows",
  "Flooring",
  "Kitchen Renovation",
  "Bathroom Renovation",
  "Addition",
  "Deck / Patio",
  "Driveway",
  "Structural Work",
  "Other Improvement",
] as const;

export const OWNER_CATEGORIES = ["Owner Contribution", "Owner Draw / Distribution"] as const;

export function categoriesForType(type: TxType): readonly string[] {
  switch (type) {
    case "income":
      return INCOME_CATEGORIES;
    case "expense":
      return EXPENSE_CATEGORIES;
    case "loan_payment":
      return LOAN_PAYMENT_CATEGORIES;
    case "capital_improvement":
      return CAPITAL_IMPROVEMENT_CATEGORIES;
    case "owner_contribution":
    case "owner_draw":
      return OWNER_CATEGORIES;
    default:
      return [];
  }
}

export const RENTAL_TYPE_LABELS = {
  long_term: "Long-Term Rental",
  short_term: "Short-Term Rental",
  "": "Not specified",
};

// Helper: is this type an outflow (reduces cash)?
export function isOutflow(type: TxType): boolean {
  return (
    type === "expense" ||
    type === "loan_payment" ||
    type === "owner_draw" ||
    type === "capital_improvement"
  );
}

// Helper: is this type an inflow?
export function isInflow(type: TxType): boolean {
  return type === "income" || type === "owner_contribution";
}
