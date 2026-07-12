import { pgTable, serial, text, numeric, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const propertiesTable = pgTable("properties", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  yearBought: integer("year_bought").notNull(),
  purchasePrice: numeric("purchase_price", { precision: 15, scale: 2 }).notNull(),
  currentValue: numeric("current_value", { precision: 15, scale: 2 }).notNull(),
  loanAmount: numeric("loan_amount", { precision: 15, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 6, scale: 4 }).notNull(),
  loanTermYears: integer("loan_term_years").notNull(),
  loanStartDate: text("loan_start_date").notNull(),
  monthlyPayment: numeric("monthly_payment", { precision: 15, scale: 2 }).notNull(),
  notes: text("notes"),
  // Valuation tracking
  valueLastUpdatedAt: timestamp("value_last_updated_at"),
  zillowUrl: text("zillow_url"),
  // Payment tracking
  autoPayEnabled: boolean("auto_pay_enabled").default(true).notNull(),
  savedExtraMonthly: numeric("saved_extra_monthly", { precision: 15, scale: 2 }),
  savedExtraPayments: jsonb("saved_extra_payments").$type<Array<{ paymentNumber: number; amount: number }>>(),
  // Current balance override — used when entering a property mid-loan
  // (e.g. bought in 2018, don't want to re-enter every extra payment)
  currentLoanBalance: numeric("current_loan_balance", { precision: 15, scale: 2 }),
  // Monthly cost tracking (does not affect amortization schedule)
  monthlyTaxes: numeric("monthly_taxes", { precision: 15, scale: 2 }),
  monthlyInsurance: numeric("monthly_insurance", { precision: 15, scale: 2 }),
  monthlyRent: numeric("monthly_rent", { precision: 15, scale: 2 }),
  // Occupancy tracking
  rentalType: text("rental_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPropertySchema = createInsertSchema(propertiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof propertiesTable.$inferSelect;
