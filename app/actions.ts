"use server";

import { db, ensureSchema } from "@/db/client";
import { events } from "@/db/schema";
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
    };
  });
}

export async function addEvent(
  rawOwner: string,
  rawDate: string,
  time: string,
  text: string,
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
  });
  revalidatePath("/");
}

export async function updateEvent(
  rawOwner: string,
  id: number,
  time: string,
  text: string,
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
      .set({ time: time.trim(), text: trimmed })
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
