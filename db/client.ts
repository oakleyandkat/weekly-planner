import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

// In dev we use PGlite (in-process Postgres stored in a single file).
// In prod we set DATABASE_URL directly, OR Suga injects POSTGRES_USER /
// POSTGRES_PASSWORD / POSTGRES_HOST / POSTGRES_DB as separate variables
// (its env vars are atomic — one reference per variable, no templating —
// so we assemble the URL here).
function resolveUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { POSTGRES_USER: u, POSTGRES_PASSWORD: p, POSTGRES_HOST: h, POSTGRES_DB: d } = process.env;
  if (u && p && h && d) {
    return `postgres://${encodeURIComponent(u)}:${encodeURIComponent(p)}@${h}:5432/${d}`;
  }
  return "pglite://./local.db";
}
const url = resolveUrl();

// Reuse the client across hot-reloads in dev so we don't open a new DB every render.
const globalForDb = globalThis as unknown as {
  __plannerDb?: ReturnType<typeof makeDb>;
  __plannerSchemaReady?: boolean;
};

function makeDb() {
  if (url.startsWith("pglite://")) {
    const file = url.replace("pglite://", "");
    return drizzlePglite(new PGlite(file), { schema });
  }
  return drizzlePg(postgres(url), { schema });
}

export const db = globalForDb.__plannerDb ?? makeDb();
if (process.env.NODE_ENV !== "production") globalForDb.__plannerDb = db;

/**
 * Creates the events table on first use. Beginner-friendly alternative
 * to a separate migration step — for a small app this is fine.
 * Switch to drizzle-kit migrations when the schema gets serious.
 */
export async function ensureSchema(): Promise<void> {
  if (globalForDb.__plannerSchemaReady) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL DEFAULT '',
      day_of_week INTEGER NOT NULL,
      time TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  // If the table already existed from a previous version without the owner
  // column, add it now. IF NOT EXISTS keeps this idempotent.
  await db.execute(sql`
    ALTER TABLE events ADD COLUMN IF NOT EXISTS owner TEXT NOT NULL DEFAULT ''
  `);
  // v2: events live on a real date, not just a day of the week. Add the
  // column and backfill anything still null by dropping the old day_of_week
  // onto the current week (Sunday = 0, so today's Sunday + day_of_week days).
  await db.execute(sql`
    ALTER TABLE events ADD COLUMN IF NOT EXISTS event_date DATE
  `);
  await db.execute(sql`
    UPDATE events
    SET event_date = (CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::int + day_of_week)
    WHERE event_date IS NULL
  `);
  globalForDb.__plannerSchemaReady = true;
}
