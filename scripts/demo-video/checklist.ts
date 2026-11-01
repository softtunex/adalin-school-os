/*
 * The parts of SchoolHub that aren't buttons on a page, so the page inventory can't list them: the PDFs it
 * prints, the emails it sends and the journeys that run across pages. Each series episode must show its
 * share; scenes name them in `covers` exactly as written here, and coverage.mjs counts them.
 */
export const PDFS = [
  "pdf: Report card",
  "pdf: Fee invoice",
  "pdf: Payment receipt",
  "pdf: Admission offer letter",
  "pdf: Payslip",
  "pdf: Student ID card",
  "pdf: Staff ID card",
  "pdf: Testimonial",
  "pdf: Certificate",
  "pdf: Transcript",
  "pdf: Letter",
  "pdf: Result PIN cards",
];

/** Emails people receive. Shown as the email arriving, or named on screen where it's sent. */
export const EMAILS = [
  "email: Welcome to SchoolHub",
  "email: Staff invitation",
  "email: Password reset",
  "email: Parent sign-in code",
  "email: Announcement",
  "email: Absence alert",
  "email: Results are ready",
  "email: New message",
  "email: Fees reminder",
  "email: Payment receipt",
  "email: Application received",
  "email: Application update",
  "email: Sick bay visit",
  "email: SchoolHub notice",
];

/** Journeys that cross pages or people. Each must be shown from start to finish. */
export const JOURNEYS = [
  "journey: Create a school and finish the setup checklist",
  "journey: Invite a teacher, who joins and sees only their screens",
  "journey: Give a staff member a role, and take it away",
  "journey: Add a student with a parent, then the parent signs in",
  "journey: Import students from the school's own Excel list",
  "journey: Promote classes at the end of the session",
  "journey: An applicant applies online, sits the exam, gets an offer and is enrolled",
  "journey: Take the morning register, and the parent is told about an absence",
  "journey: Set the timetable and swap two lessons",
  "journey: Teachers enter scores, the class teacher comments, the principal approves and publishes",
  "journey: A parent reads the report card in the app",
  "journey: Generate result PINs, and a parent checks a result with one",
  "journey: Set homework, a student submits it, the teacher marks it",
  "journey: Submit a lesson note and have it approved",
  "journey: Set a CBT test from the question bank, a student sits it, it marks itself",
  "journey: Raise term invoices, a parent pays online, the receipt goes out",
  "journey: Record a cash payment and print the receipt",
  "journey: Chase debtors with reminders",
  "journey: Hold results until fees are paid",
  "journey: Record an expense",
  "journey: Prepare payroll, approve it, and staff open their payslips",
  "journey: A staff member clocks in and requests leave, and it's approved",
  "journey: Issue an ID card, and someone verifies it with the QR code",
  "journey: Lend a library book and get it back",
  "journey: Log a behaviour incident and tell the parent",
  "journey: A student visits the sick bay and the parent is told",
  "journey: Assign students to a bus route",
  "journey: Give a boarder a room and record an exeat",
  "journey: Send an announcement to parents",
  "journey: A teacher and a parent message each other",
  "journey: Add a school event to the calendar",
  "journey: Ask Kola a question, and use each AI helper",
  "journey: Upgrade the plan, and move to a cheaper one next term",
  "journey: Connect the school's bank account for online fees",
  "journey: Buy message credits",
  "journey: Download all the school's data",
  "journey: Add a second campus and see the group dashboard",
];

export const CHECKLIST = [...PDFS, ...EMAILS, ...JOURNEYS];
