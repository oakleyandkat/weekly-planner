import { pgTable, serial, integer, text, timestamp, date } from "drizzle-orm/pg-core";

// One row per event. Each event belongs to a named owner (their username).
// event_date is the real calendar date the event lives on (YYYY-MM-DD).
// day_of_week (0..6, Sun..Sat) is kept around for backward compat with v1
// data and is derived from event_date on insert.
// category is a short tag like "class", "homework", "test" — used to colour
// events and is tailored to whether the owner is a student or teacher.
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  owner: text("owner").notNull(),
  eventDate: date("event_date"), // nullable so we can backfill from day_of_week
  dayOfWeek: integer("day_of_week").notNull(),
  time: text("time").notNull().default(""),
  text: text("text").notNull(),
  category: text("category").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// One row per owner. Holds the little profile we collect at onboarding:
// display name, student-or-teacher, school, grade. The owner column matches
// events.owner so we can join if we ever want to.
export const profiles = pgTable("profiles", {
  owner: text("owner").primaryKey(),
  displayName: text("display_name").notNull().default(""),
  role: text("role").notNull().default(""), // "student" | "teacher" | ""
  school: text("school").notNull().default(""),
  grade: text("grade").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
