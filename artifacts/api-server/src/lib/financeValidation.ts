export const VALID_TYPES = new Set([
  "income",
  "expense",
  "loan_payment",
  "owner_contribution",
  "owner_draw",
  "capital_improvement",
]);
export interface TxInput {
  propertyId?: number | null;
  date?: string;
  description?: string;
  amount?: number;
  type?: string;
  category?: string;
  vendorPayer?: string | null;
  paymentAccount?: string | null;
  notes?: string | null;
  rentalType?: string | null;
  taxYear?: number | null;
  isReviewed?: boolean;
}
export function parseTxBody(body: unknown, requireAll = true): TxInput {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("Transaction must be an object");
  const input = body as Record<string, unknown>;
  const result: TxInput = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);
  for (const field of ["date", "description", "amount", "type", "category"]) {
    if (requireAll && !has(field)) throw new Error(`${field} is required`);
  }
  if (has("date")) {
    const value = input.date;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new Error("Invalid date");
    const date = new Date(`${value}T00:00:00Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new Error("Invalid date");
    result.date = value;
  }
  for (const field of ["description", "category"] as const) {
    if (has(field)) {
      const value = input[field];
      if (typeof value !== "string" || !value.trim())
        throw new Error(`${field} is required`);
      result[field] = value.trim();
    }
  }
  if (has("amount")) {
    if (
      typeof input.amount !== "number" ||
      !Number.isFinite(input.amount) ||
      input.amount <= 0
    )
      throw new Error("Amount must be a positive finite number");
    result.amount = input.amount;
  }
  if (has("type")) {
    if (typeof input.type !== "string" || !VALID_TYPES.has(input.type))
      throw new Error("Invalid type");
    result.type = input.type;
  }
  if (has("propertyId")) {
    if (
      input.propertyId !== null &&
      (typeof input.propertyId !== "number" ||
        !Number.isInteger(input.propertyId) ||
        input.propertyId <= 0)
    )
      throw new Error("Invalid property ID");
    result.propertyId = input.propertyId as number | null;
  }
  for (const field of ["vendorPayer", "paymentAccount", "notes"] as const) {
    if (has(field)) {
      if (input[field] !== null && typeof input[field] !== "string")
        throw new Error(`Invalid ${field}`);
      result[field] = input[field] as string | null;
    }
  }
  if (has("rentalType")) {
    if (
      ![null, "", "long_term", "short_term"].includes(
        input.rentalType as string | null,
      )
    )
      throw new Error("Invalid rental type");
    result.rentalType = (input.rentalType || null) as string | null;
  }
  if (has("taxYear")) {
    if (
      input.taxYear !== null &&
      (typeof input.taxYear !== "number" ||
        !Number.isInteger(input.taxYear) ||
        input.taxYear < 1900 ||
        input.taxYear > 9999)
    )
      throw new Error("Invalid tax year");
    result.taxYear = input.taxYear as number | null;
  }
  if (has("isReviewed")) {
    if (typeof input.isReviewed !== "boolean")
      throw new Error("Invalid review status");
    result.isReviewed = input.isReviewed;
  }
  return result;
}

/** Combined/escrow/fees are debt cash outflow, but not verified principal. */
export function debtComponent(
  category: string,
): "interest" | "principal" | "other" {
  if (["Interest", "Interest Payment", "Mortgage Interest"].includes(category))
    return "interest";
  if (["Principal", "Principal Payment"].includes(category)) return "principal";
  return "other";
}

/** Explicit tax-year overrides win; otherwise a supplied date determines its year. */
export function taxYearForUpdate(
  body: TxInput,
  existingDate?: string,
): number | null | undefined {
  if (body.taxYear !== undefined) return body.taxYear;
  return body.date !== undefined && body.date !== existingDate
    ? Number(body.date.slice(0, 4))
    : undefined;
}
