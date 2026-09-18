# Procurement Management System (PMS)

Internal web application for the Office of the District Magistrate & Collector, Paschim Medinipur, West Bengal. The system of record for office procurement from requisition to payment. Physical files remain the instrument of financial sanction; this system enforces workflow, generates documents, and maintains registers.

**Internal use only.**

## Stack

- Next.js 15 (App Router, TypeScript, `src/` directory)
- Tailwind CSS v4 + shadcn/ui (`src/components/ui`)
- Supabase (Postgres + Auth) via `@supabase/supabase-js` / `@supabase/ssr`
- Prisma ORM
- zod + react-hook-form for forms and validation
- recharts (charts), qrcode, exceljs, @react-pdf/renderer (documents)

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Fill in the values:

   | Variable | Purpose |
   | --- | --- |
   | `DATABASE_URL` | Pooled Postgres connection string (Supabase, port 6543) — used by the app |
   | `DIRECT_URL` | Direct Postgres connection string (port 5432) — used by Prisma migrations |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous (public) API key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key — server-side only, never expose to the client |
   | `NEXT_PUBLIC_APP_URL` | Base URL of the app, e.g. `http://localhost:3000` |

3. **Apply migrations and seed** (requires real Supabase credentials in `.env`)

   ```bash
   npm run db:migrate   # prisma migrate deploy
   npm run db:seed      # prisma db seed
   ```

   The seed creates sections, 15 items, 5 vendors (2 empanelled), workflow
   settings, and one user per role in Supabase Auth (`dm@pms.local`,
   `adm@pms.local`, `ndc@pms.local`, `oc.establishment@pms.local`,
   `clerk.establishment@pms.local`, `nezarath.clerk@pms.local`,
   `admin@pms.local`). Default password is `ChangeMe@Pms1` — override with
   `SEED_USER_PASSWORD`. Re-running the seed is safe (idempotent upserts).

4. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000>. The root path redirects to `/dashboard`; the login shell is at `/login`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run db:migrate` | Apply Prisma migrations (`migrate deploy`) |
| `npm run db:seed` | Seed sections, items, vendors, settings, users |

## Project layout

```
src/
  app/
    (app)/            # Authenticated shell: dashboard, requisitions, approvals, ...
    login/            # Login page (Supabase Auth wiring pending)
  components/
    layout/           # TopBar, Sidebar, AppShell, AppFooter
    ui/               # shadcn/ui design system
    page-header.tsx   # Shared PageHeader (title, breadcrumb, action slot)
  lib/
    navigation.ts     # Sidebar entries + role visibility
    session.ts        # Placeholder logged-in user
    prisma.ts         # PrismaClient singleton
    numbering.ts      # Gapless document numbering (REQ/PMS/2026-27/0041)
    audit.ts          # logAudit() — append-only audit trail
prisma/
  schema.prisma       # Data-layer contract (all models + enums)
  migrations/         # Init DDL + append-only triggers & check constraints
  seed.ts             # Sections, items, vendors, settings, auth users
```

## Status

Scaffold phase. Authentication, role model, database schema, and module workflows arrive in subsequent phases.
