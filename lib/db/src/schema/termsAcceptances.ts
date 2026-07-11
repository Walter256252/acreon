import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const termsAcceptancesTable = pgTable("terms_acceptances", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
});
