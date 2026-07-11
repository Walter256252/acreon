import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";

export const emailNotesTable = pgTable("email_notes", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id, { onDelete: "cascade" }),
  threadId: text("thread_id").notNull(),
  subject: text("subject").notNull(),
  participants: text("participants").notNull(), // JSON array of email strings
  monthYear: text("month_year").notNull(), // "2025-03"
  aiSummary: text("ai_summary").notNull(),
  actionItems: text("action_items").notNull().default("[]"), // JSON array of strings
  keyDates: text("key_dates").notNull().default("[]"), // JSON array of {date, description}
  threadDate: timestamp("thread_date").notNull(),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
});

export type EmailNote = typeof emailNotesTable.$inferSelect;
