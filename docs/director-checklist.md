# What School OS needs from the Director

Collected during the build so work never stops for a question. Handed over at the end.

## Accounts and access

1. ~~GitHub repo~~ Done: `softtunex/adalin-school-os`.
2. **Neon Postgres database** (free tier is fine to start): the connection string goes in `DATABASE_URL` on Vercel.
3. **Vercel project** linked to the GitHub repo, so every push deploys.
4. **Resend API key** for emails (invitations, password resets). Adalin already uses Resend; a key for this project and a verified sending domain.
5. **Cloudinary account** for school logos and, later, student photos and documents: cloud name, API key and API secret. Uploads only work on the live site once these are set.
6. **Paystack account** (business, verified) for online school-fee payments: the secret key goes in `PAYSTACK_SECRET_KEY` on Vercel, and in the Paystack dashboard set the webhook URL to `https://<domain>/api/webhooks/paystack`. Each school's fees settle into its own bank account through a Paystack subaccount the school creates in Settings → Payments; we never hold school money. Until the key is added, online payment runs in test mode locally.
7. **`CRON_SECRET`** on Vercel (any long random string) so the daily jobs can run: fee reminders, and School OS billing (term bills, trial endings, reminders and read-only for bills more than a week overdue). Paystack pays School OS bills into Adalin's account with the same key as above.
8. **Termii account** for SMS (and WhatsApp through Termii): the API key goes in `TERMII_API_KEY` on Vercel. Register a sender ID (e.g. `SchoolOS`) with Termii and set it as `TERMII_SENDER_ID`; schools can later register their own (e.g. `ADALIN`). For texts to reach numbers on DND, ask Termii to enable the transactional (`dnd`) route and set `TERMII_CHANNEL=dnd`. Parent login codes are paid by Adalin; alerts and announcements by each school's credits.
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
11. **School OS billing terms.** Built as: a bill per school per term for students on roll at the plan price, due 14 days after it's issued, reminders a week before, on the day and three days late, and read-only mode 7 days after the due date (viewing and parents' fee payments carry on; nothing is deleted). One 30-day free trial of Standard or Premium per school. Upgrades start at once and are charged for the rest of the term; cheaper plans start next term. All the numbers are at the top of `src/lib/services/billing.ts`.
12. **Add-on prices.** Built as: School colours ₦15,000 a term (for plans below Premium), Guided setup ₦50,000, On-site setup and training ₦250,000 (Lagos; travel extra), printed result PIN cards ₦20,000 per 100. All in `src/lib/services/addons.ts`.
10. **PAYE check by an accountant.** Payroll works out PAYE on the Nigeria Tax Act 2025 bands in force from January 2026 (first ₦800,000 a year untaxed, then 15%, 18%, 21%, 23%, 25%), after 8% pension, 2.5% NHF and rent relief (20% of rent, up to ₦500,000). One-off bonuses are taxed at the person's top rate. Have an accountant confirm this before a school runs live payroll; the bands live in one file (`src/lib/payroll/tax.ts`).
7. **Receipts on Basic.** The spec put receipts with online payment on Standard; I gave numbered receipts to every fee plan because manual payments need them. Say if you want it the other way.
13. **Data protection (NDPA).** Schools can download all their data and answer a person's request for theirs (Settings, Data & privacy). Still needed from Adalin before launch: register with the Nigeria Data Protection Commission, a privacy policy and a data processing agreement for schools to accept at sign-up. Also decide on **erasure**: I haven't built "delete this person's data", because schools usually must keep academic and fee records; tell me what a school should be able to erase and I'll add it.
14. **Who at Adalin gets the admin console.** `/admin` is for users flagged as platform admins; today that's only your demo account. Name the team members who should have it and I'll add a way to grant it.
15. **Google and Microsoft sign-in (SSO).** Built and waiting for credentials. Create an OAuth client in Google Cloud Console (Web application) and an app registration in Microsoft Entra ID ("Accounts in any organizational directory and personal Microsoft accounts"), each with the redirect address `https://<live address>/api/auth/sso/google/callback` (or `/microsoft/callback`). Then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` in Vercel. The buttons appear by themselves once they're set.
16. **Custom domains (Vercel token).** Schools on Enterprise can put School OS on their own address (Settings, Web address); there, the login page and browser tabs show the school's name, logo and colour. To connect addresses automatically, create a Vercel access token (Account Settings, Tokens, scoped to the team) and set `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` and, for a team project, `VERCEL_TEAM_ID`. Until then, a school's address waits as "pending" and the team connects it by hand in Vercel, then presses **Mark live** on the school's page in `/admin`.
