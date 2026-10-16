# What School OS needs from the Director

Collected during the build so work never stops for a question. Handed over at the end.

## Accounts and access

1. ~~GitHub repo~~ Done: `softtunex/adalin-school-os`.
2. **Neon Postgres database** (free tier is fine to start): the connection string goes in `DATABASE_URL` on Vercel.
3. **Vercel project** linked to the GitHub repo, so every push deploys.
4. **Resend API key** for emails (invitations, password resets). Adalin already uses Resend; a key for this project and a verified sending domain.
5. **Cloudinary account** for school logos and, later, student photos and documents: cloud name, API key and API secret. Uploads only work on the live site once these are set.
6. **Paystack account** (business, verified) for online school-fee payments: the secret key goes in `PAYSTACK_SECRET_KEY` on Vercel, and in the Paystack dashboard set the webhook URL to `https://<domain>/api/webhooks/paystack`. Each school's fees settle into its own bank account through a Paystack subaccount the school creates in Settings → Payments; we never hold school money. Until the key is added, online payment runs in test mode locally.
7. **`CRON_SECRET`** on Vercel (any long random string) so the daily automatic fee-reminder job can run.
8. **Termii account** for SMS (and WhatsApp through Termii): the API key goes in `TERMII_API_KEY` on Vercel. Register a sender ID (e.g. `SchoolOS`) with Termii and set it as `TERMII_SENDER_ID`; schools can later register their own (e.g. `GREENFIELD`). For texts to reach numbers on DND, ask Termii to enable the transactional (`dnd`) route and set `TERMII_CHANNEL=dnd`. Parent login codes are paid by Adalin; alerts and announcements by each school's credits.
9. **Vercel Pro (or another scheduler)** if we want the outbox safety net every 10 minutes (`/api/cron/outbox`). Messages normally go out straight after each action; the cron only catches stragglers. The Hobby plan allows daily crons only.
11. **Cloudflare R2 bucket** for private documents (homework, worksheets, lesson notes, later admission papers). Create a bucket (e.g. `school-os-files`) and an API token with read/write on it, then set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET` on Vercel. In the bucket's CORS settings allow `PUT` from the live domain with the `content-type` header, because browsers upload straight to R2. Keep the bucket private: every download goes through the app's access check. Until this is set, uploads only work locally.
10. **Domain** for the product once the name is decided (e.g. `schoolos.ng`), with each school on its own subdomain later.

## Live-site safety (for whoever sets up Vercel)

- Never set `ALLOW_TEST_LOGIN_CODES` or `PAYMENTS_TEST_MODE` on the live site. They exist for CI and demo servers only: the first shows parent sign-in codes on screen and accepts a fixed code, the second fakes Paystack.

## Assets

1. **Illustrations and mascot.** Full brief in `docs/illustration-briefs.md` (11 images, 3 optional animations). Drop the files into `public/illustrations/`.

## Decisions (built with working defaults, swappable in one place)

1. **Product name.** Currently "School OS" (`src/lib/config.ts`).
2. **Pricing.** ₦0 / ₦600 / ₦1,200 / ₦1,800 per student per term, Free capped at 50 students and 5 staff (`src/lib/plans/catalog.ts`).
3. **Default theme.** Light, with dark mode.
4. **Pilot school.** Needed before launch.
5. **Support WhatsApp number** shown in the app (`src/lib/config.ts`).
6. **Our cut of online fee payments.** The spec mentions a small processing margin. Built as `PAYSTACK_PLATFORM_PERCENT` (default 0%, so Adalin takes nothing until you set it). Paystack's own fee is charged to the school. Decide the percentage, or keep it at 0 as a selling point.
8. **SMS credit prices.** Packs built at ₦5 (500), ₦4.50 (2,000), ₦4 (5,000) and ₦3.50 (20,000) per credit, against Termii's cost of roughly ₦2.5–₦4 per SMS. Adjust in `src/lib/services/credits.ts` once Termii confirms our rate.
9. **Student portal timing.** Parked to Phase 5, where students actually need logins (CBT exams, assignments, timetable). Parents already see everything in Phase 4.
10. **PAYE check by an accountant.** Payroll works out PAYE on the Nigeria Tax Act 2025 bands in force from January 2026 (first ₦800,000 a year untaxed, then 15%, 18%, 21%, 23%, 25%), after 8% pension, 2.5% NHF and rent relief (20% of rent, up to ₦500,000). One-off bonuses are taxed at the person's top rate. Have an accountant confirm this before a school runs live payroll; the bands live in one file (`src/lib/payroll/tax.ts`).
7. **Receipts on Basic.** The spec put receipts with online payment on Standard; I gave numbered receipts to every fee plan because manual payments need them. Say if you want it the other way.
