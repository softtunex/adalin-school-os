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
8. **Domain** for the product once the name is decided (e.g. `schoolos.ng`), with each school on its own subdomain later.

## Assets

1. **Illustrations and mascot.** Full brief in `docs/illustration-briefs.md` (11 images, 3 optional animations). Drop the files into `public/illustrations/`.

## Decisions (built with working defaults, swappable in one place)

1. **Product name.** Currently "School OS" (`src/lib/config.ts`).
2. **Pricing.** ₦0 / ₦600 / ₦1,200 / ₦1,800 per student per term, Free capped at 50 students and 5 staff (`src/lib/plans/catalog.ts`).
3. **Default theme.** Light, with dark mode.
4. **Pilot school.** Needed before launch.
5. **Support WhatsApp number** shown in the app (`src/lib/config.ts`).
6. **Our cut of online fee payments.** The spec mentions a small processing margin. Built as `PAYSTACK_PLATFORM_PERCENT` (default 0%, so Adalin takes nothing until you set it). Paystack's own fee is charged to the school. Decide the percentage, or keep it at 0 as a selling point.
7. **Receipts on Basic.** The spec put receipts with online payment on Standard; I gave numbered receipts to every fee plan because manual payments need them. Say if you want it the other way.
