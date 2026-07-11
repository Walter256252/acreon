import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";

export const propertyGeocodesTable = pgTable("property_geocodes", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull().unique(),
  lat: numeric("lat", { precision: 12, scale: 8 }).notNull(),
  lng: numeric("lng", { precision: 12, scale: 8 }).notNull(),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  displayName: text("display_name"),
  geocodedAt: timestamp("geocoded_at").defaultNow().notNull(),
});
