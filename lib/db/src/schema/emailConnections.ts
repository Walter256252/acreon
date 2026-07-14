import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const emailConnectionsTable = pgTable("email_connections", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(), // Clerk user ID — one connection per user
  displayEmail: text("display_email").notNull(),
  provider: text("provider").notNull().default("imap"), // "imap" | "gmail"
  // IMAP credentials (nullable — not used for OAuth providers)
  imapHost: text("imap_host"),
  imapPort: integer("imap_port"),
  imapEmail: text("imap_email"),
  imapPassword: text("imap_password"),
  imapTls: boolean("imap_tls").notNull().default(true),
  // Gmail OAuth tokens (nullable — only used for provider="gmail")
  gmailAccessToken: text("gmail_access_token"),
  gmailRefreshToken: text("gmail_refresh_token"),
  gmailTokenExpiry: timestamp("gmail_token_expiry"),
  // Status
  verified: boolean("verified").notNull().default(false),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type EmailConnection = typeof emailConnectionsTable.$inferSelect;
