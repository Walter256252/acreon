import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  paymentDate: text("payment_date").notNull(),
  paymentAmount: numeric("payment_amount", { precision: 15, scale: 2 }).notNull(),
  principalAmount: numeric("principal_amount", { precision: 15, scale: 2 }).notNull(),
  interestAmount: numeric("interest_amount", { precision: 15, scale: 2 }).notNull(),
  extraPayment: numeric("extra_payment", { precision: 15, scale: 2 }).default("0"),
  remainingBalance: numeric("remaining_balance", { precision: 15, scale: 2 }).notNull(),
  paymentNumber: integer("payment_number"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
