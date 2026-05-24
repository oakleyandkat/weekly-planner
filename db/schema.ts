import { pgTable, serial, integer, text, timestamp, date } from "drizzle-orm/pg-core";

// One row per event. Each event belongs to a named owner (their username).
// event_date is the real calendar date the event lives on (YYYY-MM-DD).
// day_of_week (0..6, Sun..Sat) is kept around for backward compat with v1
// data and is derived from event_date on insert.
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  owner: text("owner").notNull(),
  eventDate: date("event_date"), // nullable so we can backfill from day_of_week
  dayOfWeek: integer("day_of_week").notNull(),
  time: text("time").notNull().default(""),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
