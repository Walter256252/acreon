import { pgTable, serial, integer, text, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";

export const occupancyRecordsTable = pgTable(
  "occupancy_records",
  {
    id: serial("id").primaryKey(),
    propertyId: integer("property_id")
      .notNull()
      .references(() => propertiesTable.id, { onDelete: "cascade" }),
    // "YYYY-MM" for long-term rental, "YYYY-MM-DD" for short-term
    period: text("period").notNull(),
    occupied: boolean("occupied").notNull().default(true),
    // For short-term rentals: number of nights occupied that month
    nights: integer("nights"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("occupancy_records_property_period").on(t.propertyId, t.period)]
);

export type OccupancyRecord = typeof occupancyRecordsTable.$inferSelect;
