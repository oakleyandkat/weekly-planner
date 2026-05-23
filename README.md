# My Week — Weekly Planner

A weekly planner with 10 swappable themes. Events save to a real database (PGlite locally — a Postgres-compatible database stored in a single file on your computer). Built with Next.js, TypeScript, Tailwind, and Drizzle ORM.

## First-time setup

Open Terminal and run these once:

```bash
cd ~/Projects/weekly-planner
rm -rf node_modules            # clean install (recommended on first run)
npm install                    # downloads dependencies (~1 minute)
```

## Running the app

```bash
npm run dev
```

Open <http://localhost:3000> in your browser. The events table is created automatically on first request. The database lives in `local.db` in this folder.

To stop the dev server, press `Ctrl + C` in Terminal.

## How it's structured

```
app/
├── page.tsx              # server component — loads events from DB
├── planner-client.tsx    # the React UI (7-day grid, theme picker, modal)
├── actions.ts            # server actions: addEvent, updateEvent, deleteEvent
├── layout.tsx            # global layout + theme script
└── globals.css           # all 10 themes via CSS variables
db/
├── schema.ts             # events table definition
└── client.ts             # PGlite client + auto-create-table helper
lib/
└── env.ts                # env var helper
local.db                  # your database (gitignored)
```

## Future steps

- **Add login** so multiple people can have their own planner → install Better-Auth
- **Deploy online** so it works on phone + laptop → set `DATABASE_URL` to a real Postgres URL and deploy
- **Add proper migrations** instead of auto-create → install `drizzle-kit`

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS 4](https://tailwindcss.com)
- [Drizzle ORM](https://orm.drizzle.team)
- [PGlite](https://pglite.dev) — embedded Postgres, no server required
