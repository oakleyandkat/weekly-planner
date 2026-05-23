import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

// One row per event. Each event belongs to a named owner (their username).
// day_of_week is 0..6 (Sunday..Saturday).
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  owner: text("owner").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  time: text("time").notNull().default(""),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
