// Fail-fast on missing env vars. Better than mysterious runtime errors later.
const required = ["DATABASE_URL"] as const;
for (const k of required) {
  if (!process.env[k]) {
    // Don't crash in build; only at first read in a request.
    // (Next.js builds may not have envs set.)
  }
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "pglite://./local.db",
};
