# Data breach procedure

What Adalin does if personal data in School OS is, or may have been, exposed, lost, changed or accessed without permission. It meets the Nigeria Data Protection Act 2023 (NDPA) and our data processing agreement: schools hear from us within **24 hours**, so they (the controllers) can notify the Nigeria Data Protection Commission (NDPC) within **72 hours**.

## 1. Spot and report (immediately)

Anyone at Adalin who suspects a breach tells the Tech Lead and the Director at once, by phone, not just a message. Signs include: an error-tracking alert showing data in the wrong place, a school reporting someone seeing another school's data, a leaked key or password, a lost laptop, unusual exports in the activity log or the admin console.

Write down the time you noticed. The 24- and 72-hour clocks start then.

## 2. Contain (first hour)

- Revoke what was exposed: rotate secrets in Vercel (database, Paystack, Resend, Termii, Cloudinary, `CRON_SECRET`), revoke affected API keys, end sessions (Account → Sign out everywhere, or delete from `sessions`).
- If a school's data is at risk, set the school read-only or suspended from `/admin` while investigating.
- Don't delete evidence: keep logs, the `audit_logs` and `platform_audit` rows, and Vercel and Neon logs.

## 3. Assess (first 12 hours)

Answer, in writing:

- What happened, when, and is it still happening?
- Which schools and how many people? Whose data: students (children), parents, staff?
- What kind of data: contact details, results, health records, bank or pay details, passwords?
- Is there a real risk to people (identity theft, safety of a child, financial loss)?

## 4. Notify

- **Schools affected: within 24 hours** of noticing, by email and phone to the proprietor, with what is known, what we've done, and what they should do. Template below.
- **NDPC: within 72 hours**, by the school as controller where a risk to people is likely; Adalin prepares the report for them. Where Adalin is the controller (school owners' accounts, our billing), Adalin notifies NDPC itself.
- **People affected**, without undue delay where the risk to them is high (for example health or financial data), usually by the school, with our help.

## 5. Fix and learn (within 2 weeks)

- Fix the cause; add a test so it can't come back.
- Write a short report: timeline, cause, impact, actions. Keep it with this document's log below.
- Review whether the privacy notice, this procedure or our training needs changing.

## Message to a school (template)

> Subject: Important: a data security incident affecting [School]
>
> Dear [Proprietor],
>
> On [date and time] we found that [what happened, in plain words]. It affects [which data] for [about how many] [students / parents / staff] at [School].
>
> We have [what we did to stop it]. We are still investigating and will update you by [time].
>
> Under the Nigeria Data Protection Act, the school may need to tell the Nigeria Data Protection Commission within 72 hours of [time we noticed]. We have prepared the details you need and will help you file it. Please call [name, number] today.
>
> We're sorry this happened.
>
> [Name], Adalin Technologies

## Log

| Date | What happened | Schools | Notified schools | Notified NDPC | Report |
| --- | --- | --- | --- | --- | --- |
| | | | | | |
