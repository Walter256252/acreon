import { pgTable, serial, integer, text, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { emailNotesTable } from "./emailNotes";

export const finEmailSuggestionsTable = pgTable("fin_email_suggestions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  emailNoteId: integer("email_note_id")
    .notNull()
    .references(() => emailNotesTable.id, { onDelete: "cascade" }),
  // Cached display info from the source email
  emailSubject: text("email_subject").notNull(),
  emailSummary: text("email_summary").notNull(),
  emailDate: text("email_date").notNull(), // YYYY-MM-DD
  // Pre-filled transaction fields
  propertyId: integer("property_id"),
  suggestedDate: text("suggested_date").notNull(),
  suggestedDescription: text("suggested_description").notNull(),
  suggestedAmount: numeric("suggested_amount", { precision: 15, scale: 2 }),
  suggestedType: text("suggested_type").notNull(),   // same types as fin_transactions
  suggestedCategory: text("suggested_category").notNull(),
  suggestedVendor: text("suggested_vendor"),
  // Lifecycle
  dismissed: boolean("dismissed").notNull().default(false),
  convertedTxId: integer("converted_tx_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type FinEmailSuggestion = typeof finEmailSuggestionsTable.$inferSelect;
