import { ensureSchema } from "@/db/client";
import PlannerClient from "./planner-client";

// Always render fresh from the DB.
export const dynamic = "force-dynamic";

export default async function Home() {
  // Touch the DB so the table exists on first visit. Actual events are
  // fetched client-side once we know who the user is.
  await ensureSchema();
  return <PlannerClient />;
}
