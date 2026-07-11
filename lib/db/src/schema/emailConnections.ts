import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const emailConnectionsTable = pgTable("email_connections", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(), // Clerk user ID — one connection per user
  displayEmail: text("display_email").notNull(),
  provider: text("provider").notNull().default("imap"),
  imapHost: text("imap_host").notNull(),
  imapPort: integer("imap_port").notNull(),
  imapEmail: text("imap_email").notNull(),
  imapPassword: text("imap_password").notNull(),
  imapTls: boolean("imap_tls").notNull().default(true),
  verified: boolean("verified").notNull().default(false),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type EmailConnection = typeof emailConnectionsTable.$inferSelect;
