# Demo accounts

Logins for the demo school **Greenfield College** (school code `greenfield-college`) on a local or demo server. They come from the seed scripts (`pnpm db:seed` and the `db:seed-*` steps), so they exist only on databases built from them, never on the live site.

Local app: <http://localhost:3005>

## Staff

Sign in at `/login`. Every staff account uses the password **`Demo2026!`**.

| Person | Role | Email | What to try |
| --- | --- | --- | --- |
| Olatunji Buari | Proprietor (owner) | `director@demo.schoolos.ng` | Everything. Lesson notes → For approval has a note waiting. |
| Dr Adebayo Ogunleye | Principal | `ogunleye0@demo.schoolos.ng` | Results approval, lesson-note approval |
| Mrs Chioma Nwosu | School admin | `nwosu1@demo.schoolos.ng` | Students, classes, timetable |
| Mr Ibrahim Musa | Bursar | `musa2@demo.schoolos.ng` | Fees, payments, expenses |
| Mrs Funmilayo Adeyemi | Class teacher, JSS 1 Gold | `adeyemi3@demo.schoolos.ng` | Attendance, report-card comments |
| Mr Emeka Obi | Maths teacher, JSS 1 | `obi4@demo.schoolos.ng` | Assignments, CBT exams, lesson notes, score entry |
| Miss Zainab Bello | English teacher, JSS 1 | `bello5@demo.schoolos.ng` | Score entry |
| Mrs Grace Okafor | Librarian | `librarian6@demo.schoolos.ng` | Library: catalogue, lending, returns, fines (one loan overdue, one fine owed) |
| Mr Sunday Eze | Storekeeper | `storekeeper7@demo.schoolos.ng` | Inventory: stock in, issue, sign out and take back assets, stock counts (A4 paper and diesel running low) |

## Parent

Sign in at `/parent` with the phone number or email. On local and demo servers the code is shown on screen, and **`123456`** always works.

| Parent | Phone | Email | Children |
| --- | --- | --- | --- |
| Mrs Blessing Lawal | `0803 006 3352` | `parent8@example.com` | Oluwaseun Lawal (JSS 1 Gold, fees paid), Folake Lawal (SS 1 Diamond, owing) |

## Student

Sign in at `/student`.

| Student | School code | Admission no | Password |
| --- | --- | --- | --- |
| Oluwaseun Lawal, JSS 1 Gold | `greenfield-college` | `GFC/2026/0009` | **`Student2026`** |

He has homework due, an open CBT test ("Second CA test") and published results.

Other students get logins from **Students → Logins** (staff side), which prints slips with a temporary password.

## Admissions (no login needed)

- Public application form: <http://localhost:3005/apply/greenfield-college>. Anyone can apply; the ₦5,000 form fee uses the test checkout.
- A parent's page with an open offer (Chiamaka Nwosu, accept or decline it here): <http://localhost:3005/apply/greenfield-college/status/3ZL2Nozb_eanE4fFK5wrxxcZtZOqJrI3>. This link only works on your local demo database; `pnpm db:seed-admissions` prints a fresh one on a new database.
- Staff side: **Admissions** in the sidebar (Director or admin).

## Payments

Online fee payments run in test mode locally: the Paystack checkout is a built-in test page, so no card is charged.

## Safety

- These passwords are public in this repo. Never seed the live database with them.
- The fixed parent code `123456` and the on-screen codes only work when `ALLOW_TEST_LOGIN_CODES` is set or the app isn't in production. Never set it on the live site.
