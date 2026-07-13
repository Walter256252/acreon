import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";

export const finTransactionsTable = pgTable("fin_transactions", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  propertyId: integer("property_id").references(() => propertiesTable.id, {
    onDelete: "set null",
  }),
  date: text("date").notNull(), // YYYY-MM-DD
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(), // always positive
  type: text("type").notNull(), // 'income' | 'expense' | 'loan_payment' | 'owner_contribution' | 'owner_draw' | 'capital_improvement'
  category: text("category").notNull(),
  vendorPayer: text("vendor_payer"),
  paymentAccount: text("payment_account"),
  notes: text("notes"),
  rentalType: text("rental_type"), // 'long_term' | 'short_term'
  taxYear: integer("tax_year"),
  isReviewed: boolean("is_reviewed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
