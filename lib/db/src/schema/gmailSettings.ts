import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";

// Stores per-user, per-property pull settings (label vs address mode)
export const gmailSettingsTable = pgTable("gmail_settings", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().default(""),
  pullMode: text("pull_mode").notNull().default("address"), // 'label' | 'address'
  gmailLabel: text("gmail_label"), // folder path when pullMode = 'label'
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  propertyUserUnique: unique().on(t.propertyId, t.userId),
}));

export type GmailSettings = typeof gmailSettingsTable.$inferSelect;
