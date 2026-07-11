import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const userPreferencesTable = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  monthlyDigestEnabled: boolean("monthly_digest_enabled").notNull().default(false),
  lastDigestSentAt: timestamp("last_digest_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserPreferences = typeof userPreferencesTable.$inferSelect;
