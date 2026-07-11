import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";

export const gmailSettingsTable = pgTable("gmail_settings", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id, { onDelete: "cascade" })
    .unique(),
  pullMode: text("pull_mode").notNull().default("address"), // 'label' | 'address'
  gmailLabel: text("gmail_label"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type GmailSettings = typeof gmailSettingsTable.$inferSelect;
