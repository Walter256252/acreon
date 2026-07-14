import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const termsAcceptancesTable = pgTable("terms_acceptances", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
  // Onboarding profile fields
  howFound: text("how_found"),          // e.g. "google", "friend", "social_media"
  propertyTypes: text("property_types"), // comma-separated: "sfr,multi_family"
  geoFocus: text("geo_focus"),           // free text: state / metro
});
