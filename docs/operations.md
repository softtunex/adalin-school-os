# Operations runbook

How Adalin SchoolHub is watched, backed up and recovered once it's live. Pair with `docs/security/breach-procedure.md` for incidents involving personal data.

## Monitoring

| What | How | Alert when |
| --- | --- | --- |
| Errors | Every unexpected server error (`src/instrumentation.ts`) and browser error (`/api/report-error`) goes to the log and, with `SENTRY_DSN` set, to Sentry. No cookies, form data or query strings are sent. | A new error type appears, or one error spikes. |
| Uptime | An uptime service polls `GET /api/health` every minute. It returns 200 when the app and database answer, 503 when the database doesn't. | Two failures in a row. Also shown on the public status page. |
| Slow requests | Any school transaction over 1 second is logged as `[slow] school <id> transaction took N ms` (threshold: `SLOW_QUERY_MS`). Neon's query insights show which queries. | Daily review; index or rework repeat offenders. |
| Background jobs | Vercel Cron runs `/api/cron/outbox` every 10 minutes and `/api/cron/billing` daily at 06:00. Each returns a JSON report. | A run fails (Vercel shows failed cron invocations). |
| Safe settings | On the live site (`VERCEL_ENV=production`) the app refuses to start if `DATABASE_URL`, `APP_URL`, `CRON_SECRET` or `SESSION_SECRET` is missing, if `APP_URL` isn't https, or if a test switch (`ALLOW_TEST_LOGIN_CODES`, `PAYMENTS_TEST_MODE`, `ALLOW_LOCAL_DB`) is on. | The deployment fails, so a bad config never goes live. |

## Backups

Neon keeps the database restorable to any moment within its history window (point-in-time restore). On a paid Neon plan, set the history window to **at least 7 days**. Uploaded files live with Cloudinary and Cloudflare R2, which keep their own redundancy.

## Restore drill (do it before launch, then every term)

The drill proves backups actually work. It takes about 15 minutes.

1. Record the live database: `DATABASE_URL=<production> npx tsx scripts/restore-check.ts --save before.json`
2. In Neon, create a branch from production at a recent point in time (Branches → Create branch → "Past data"), or with the CLI: `neonctl branches create --parent main --name drill --parent-timestamp <time just after step 1>`.
3. Check the restored branch: `DATABASE_URL=<drill branch> npx tsx scripts/restore-check.ts --compare before.json`. It confirms every migration is applied, row-level security protects every school table, schools are isolated, and the rows match.
4. Point a preview deployment at the branch and sign in as a demo user, to be sure the app runs on it.
5. Delete the branch. Write the date and result in the log below.

To actually recover, after confirming the branch with step 3: in Neon, restore the production branch to that point (or promote the drill branch), then redeploy. Tell schools, and if personal data was affected, follow the breach procedure.

## Drill log

| Date | Restored to | Result | By |
| --- | --- | --- | --- |
| 17 Oct 2026 | Local copy of the test database (backup, delete, restore) | Passed: 26/26 migrations, 90 tables protected, rows identical. A deliberately damaged copy (one payment removed) was caught. | Ade |
