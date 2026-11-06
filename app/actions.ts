"use server";

import { db, ensureSchema } from "@/db/client";
import { events, profiles } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Light validation: usernames are 1..30 chars, allow letters, numbers, spaces,
// underscores, dashes. Trimmed + lowercased so "Oakley" and "oakley" are the
// same planner.
function normaliseOwner(name: string): string | null {
  const trimmed = name.trim().toLowerCase();
  if (trimmed.length < 1 || trimmed.length > 30) return null;
  if (!/^[a-z0-9 _-]+$/.test(trimmed)) return null;
  return trimmed;
}

// Accepts "YYYY-MM-DD" only. Returns the same string if valid, else null.
function normaliseDate(s: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return s;
}

function dayOfWeekFor(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

// Allowed category slugs. Anything else is coerced to "" so bad input can't
// paint events with made-up CSS classes.
const CATEGORIES = new Set([
  "",
  "class",
  "homework",
  "test",
  "project",
  "event",
  "personal",
  "grading",
  "meeting",
  "lesson",
]);
function normaliseCategory(c: string): string {
  const t = c.trim().toLowerCase();
  return CATEGORIES.has(t) ? t : "";
}

function normaliseRole(r: string): "student" | "teacher" | "" {
  const t = r.trim().toLowerCase();
  return t === "student" || t === "teacher" ? t : "";
}

function clampText(s: string, max: number): string {
  return s.trim().slice(0, max);
}

export async function getEventsForOwner(rawOwner: string) {
  await ensureSchema();
  const owner = normaliseOwner(rawOwner);
  if (!owner) return [];
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.owner, owner))
    .orderBy(asc(events.eventDate), asc(events.createdAt));
  return rows.map((r) => {
    // Drizzle's date() column returns string (YYYY-MM-DD) in postgres-js; pglite
    // may return a Date. Handle both without confusing TypeScript.
    let dateStr = "";
    const raw: unknown = r.eventDate;
    if (typeof raw === "string") dateStr = raw;
    else if (raw && typeof (raw as Date).toISOString === "function") {
      dateStr = (raw as Date).toISOString().slice(0, 10);
    }
    return {
      id: r.id,
      eventDate: dateStr,
      dayOfWeek: r.dayOfWeek,
      time: r.time,
      text: r.text,
      category: r.category ?? "",
    };
  });
}

export async function addEvent(
  rawOwner: string,
  rawDate: string,
  time: string,
  text: string,
  category: string = "",
): Promise<void> {
  await ensureSchema();
  const owner = normaliseOwner(rawOwner);
  if (!owner) return;
  const eventDate = normaliseDate(rawDate);
  if (!eventDate) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  await db.insert(events).values({
    owner,
    eventDate,
    dayOfWeek: dayOfWeekFor(eventDate),
    time: time.trim(),
    text: trimmed,
    category: normaliseCategory(category),
  });
  revalidatePath("/");
}

export async function updateEvent(
  rawOwner: string,
  id: number,
  time: string,
  text: string,
  category: string = "",
): Promise<void> {
  await ensureSchema();
  const owner = normaliseOwner(rawOwner);
  if (!owner) return;
  const trimmed = text.trim();
  if (!trimmed) {
    await db
      .delete(events)
      .where(and(eq(events.id, id), eq(events.owner, owner)));
  } else {
    await db
      .update(events)
      .set({
        time: time.trim(),
        text: trimmed,
        category: normaliseCategory(category),
      })
      .where(and(eq(events.id, id), eq(events.owner, owner)));
  }
  revalidatePath("/");
}

export async function deleteEvent(
  rawOwner: string,
  id: number,
): Promise<void> {
  await ensureSchema();
  const owner = normaliseOwner(rawOwner);
  if (!owner) return;
  await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.owner, owner)));
  revalidatePath("/");
}

export async function clearAllEvents(rawOwner: string): Promise<void> {
  await ensureSchema();
  const owner = normaliseOwner(rawOwner);
  if (!owner) return;
  await db.delete(events).where(eq(events.owner, owner));
  revalidatePath("/");
}

// Bulk insert for pre-filling a schedule from an onboarding template.
// Each item is {eventDate, time, text, category}. Bad items are silently
// dropped so one weird row can't block the batch.
export async function addBulkEvents(
  rawOwner: string,
  items: Array<{
    eventDate: string;
    time?: string;
    text: string;
    category?: string;
  }>,
): Promise<void> {
  await ensureSchema();
  const owner = normaliseOwner(rawOwner);
  if (!owner) return;
  const rows = items
    .map((it) => {
      const eventDate = normaliseDate(it.eventDate);
      const text = (it.text ?? "").trim();
      if (!eventDate || !text) return null;
      return {
        owner,
        eventDate,
        dayOfWeek: dayOfWeekFor(eventDate),
        time: (it.time ?? "").trim(),
        text,
        category: normaliseCategory(it.category ?? ""),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) return;
  await db.insert(events).values(rows);
  revalidatePath("/");
}

// ------- profiles -------

export type ProfileDTO = {
  owner: string;
  displayName: string;
  role: "student" | "teacher" | "";
  school: string;
  grade: string;
};

export async function getProfile(rawOwner: string): Promise<ProfileDTO | null> {
  await ensureSchema();
  const owner = normaliseOwner(rawOwner);
  if (!owner) return null;
  const rows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.owner, owner))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    owner: row.owner,
    displayName: row.displayName ?? "",
    role: normaliseRole(row.role ?? ""),
    school: row.school ?? "",
    grade: row.grade ?? "",
  };
}

export async function saveProfile(
  rawOwner: string,
  displayName: string,
  role: string,
  school: string,
  grade: string,
): Promise<void> {
  await ensureSchema();
  const owner = normaliseOwner(rawOwner);
  if (!owner) return;
  const values = {
    owner,
    displayName: clampText(displayName || owner, 30),
    role: normaliseRole(role),
    school: clampText(school, 60),
    grade: clampText(grade, 20),
  };
  // Upsert so repeated saves just update the row.
  await db
    .insert(profiles)
    .values(values)
    .onConflictDoUpdate({
      target: profiles.owner,
      set: {
        displayName: values.displayName,
        role: values.role,
        school: values.school,
        grade: values.grade,
      },
    });
  revalidatePath("/");
}
