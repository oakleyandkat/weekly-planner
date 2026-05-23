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

export async function getEventsForOwner(rawOwner: string) {
  await ensureSchema();
  const owner = normaliseOwner(rawOwner);
  if (!owner) return [];
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.owner, owner))
    .orderBy(asc(events.dayOfWeek), asc(events.createdAt));
  return rows.map((r) => ({
    id: r.id,
    dayOfWeek: r.dayOfWeek,
    time: r.time,
    text: r.text,
  }));
}

export async function addEvent(
  rawOwner: string,
  dayOfWeek: number,
  time: string,
  text: string,
): Promise<void> {
  await ensureSchema();
  const owner = normaliseOwner(rawOwner);
  if (!owner) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  if (dayOfWeek < 0 || dayOfWeek > 6) return;
  await db.insert(events).values({
    owner,
    dayOfWeek,
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
