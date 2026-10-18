# Adalin SchoolHub

Multi-school management SaaS by Adalin Technologies. One codebase serves proprietors, principals, admin staff, bursars, teachers, parents and students, each with their own view, with features unlocked by plan.

## Run it locally

```bash
pnpm install
pnpm db:migrate     # creates the local database in .data/
pnpm dev            # http://localhost:3005
```

No Docker or Postgres install needed: local development uses PGlite (real Postgres running in-process). Set `DATABASE_URL` to use a real Postgres instead.

## Tests

```bash
pnpm test           # unit and integration tests (in-memory Postgres)
pnpm test:e2e       # browser tests, desktop and phone (starts the dev server if needed)
pnpm typecheck && pnpm lint
```

## How it's put together

- **Next.js 16** (App Router, Server Actions), TypeScript, Tailwind CSS v4, Geist.
- **Drizzle ORM** on Postgres. Schema in `src/lib/db/schema.ts`, migrations in `drizzle/` (`pnpm db:generate` after schema changes).
- **Tenant isolation.** Every school-owned table has `school_id` and Postgres row-level security. School data is always read and written through `withTenant()` (`src/lib/db/tenant.ts`), which switches to a restricted database role that can only see the current school. Tests in `test/tenant-isolation.test.ts`.
- **Permissions.** Catalog in `src/lib/rbac/permissions.ts`, built-in roles in `src/lib/rbac/roles.ts`. Every service function checks permissions server-side; nobody can grant a permission they don't hold.
- **Plans.** Defaults in `src/lib/plans/catalog.ts`, stored in the `plans` table so prices and features can change without a deploy. `requireFeature()` and `requireWithinLimit()` gate features.
- **Services** in `src/lib/services/` hold all business rules and are tested directly; pages and actions in `src/app/` stay thin.
- **Audit log** records sensitive changes with who, what and when.

## Project docs

- `docs/director-checklist.md`: everything still needed from the Director (accounts, keys, decisions).
