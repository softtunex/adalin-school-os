/*
 * What Kola knows about using Adalin SchoolHub, one entry per page (keyed by its path after /s/<school>).
 * Kola only sees the entries for pages the person can open, so it never sends anyone somewhere they can't go.
 * Keep it in the words on screen: page, tab and button names exactly as people see them.
 */

export const KOLA_GUIDE: Record<string, string> = {
  "": "Overview: the home page. Today's numbers (attendance, fees, results progress), things that need attention, and the setup checklist for a new school.",
  "/students":
    "Students: every student, with search, class filter and export. Buttons: Add a student (one at a time), Import (Import from Excel: download the template, fill it, upload; up to 5 MB), Logins (create student logins and print slips with a temporary password), Promote (move classes up at the end of a session). Open a student to see tabs Details, Parents & guardians, Fees, Results, Health, Conduct and Class history.",
  "/admissions":
    "Admissions: online applications. Settings → Admissions turns on Taking applications and sets the Application form fee. Parents apply at the school's public apply link. Each applicant moves through the Pipeline: review, entrance exam score, interview notes, offer, then enrol (which creates the student).",
  "/attendance":
    "Attendance: Today's register for each class: mark In school, Absent or Late, then save. Monthly shows the month for a class. Class teachers see their own classes; school-wide roles see all.",
  "/results":
    "Results: Subject sheets: teachers open their sheet (Enter scores) and submit it. Class results: the class teacher sees the Broadsheet and writes Report comments (Class teacher's comment, Principal's comment). The principal approves and publishes; parents then see report cards. PIN batches makes result checker PINs (How many PINs, Checks allowed per PIN). Score parts (CA, exam) and grade bands are set in Classes & subjects → Assessment & grading.",
  "/timetable":
    "Timetable: build each class's week. Set the Bell schedule (periods and breaks) first, then place subjects and teachers in periods. SchoolHub warns when a teacher or room clashes.",
  "/academics":
    "Classes & subjects: tabs Classes (class levels and arms, class teacher), Subjects, Sessions & terms (set the current session and term, with Resumes and Vacates dates; most term-based pages need a current term), Subject teachers (who teaches what), Electives, Assessment & grading (score parts and grade bands).",
  "/assignments": "Assignments: Set an assignment for a class and subject with instructions, due date and worksheets. Students hand in on the app; teachers mark them. Tabs show what's open, waiting to be marked, and marked.",
  "/cbt":
    "CBT exams: Question bank: Add question, Paste questions (copy from Word or WhatsApp; blank line between questions, options A. B. C., * after the correct one, [4 marks] for theory), and Write with AI (draft questions from a topic, or From a photo of a test paper; the teacher checks them before Add to the bank). Exams tab: the New exam button at the top right (choose classes, opening and closing times, duration, then pick questions from the bank) and publish it; students take it on the app; theory answers are marked by the teacher; scores can be sent to the CA column.",
  "/materials": "Materials: upload notes, videos and files for a class and subject; students open them on the app.",
  "/lesson-notes": "Lesson notes: teachers write a New lesson note (week, topic, objectives) or attach a scanned note and submit it. The principal or head reviews: approve or return with a comment. Tabs show drafts, awaiting approval, returned and approved.",
  "/discipline": "Behaviour: record merits and incidents for students; parents can be told. Behaviour points and categories are set in Settings → Behaviour.",
  "/library": "Library: the catalogue (add books by ISBN), lend books to students and staff, record returns. Overdue fines are worked out on return. Loan rules are in Settings → Library.",
  "/transport": "Transport: routes, buses, drivers and riders. The bus register records pick-up and drop-off. Bus fees can be added to invoices.",
  "/hostel": "Hostel: hostels, rooms and beds, allocate boarders, and exeats (parents request; the warden approves; record when the student leaves and returns).",
  "/sick-bay": "Sick bay: log visits (complaint, treatment, medicine given, sent home or resting). Health records hold allergies, blood group and genotype; SchoolHub warns before giving a medicine a student is allergic to.",
  "/announcements": "Announcements: New announcement with title and message, choose Who it's for, and optionally Also email it or Also send by SMS (SMS uses credits). Pin to the top keeps it first. Parents see it in their app.",
  "/calendar": "Calendar: school events, holidays and exam dates that staff and parents see.",
  "/messages": "Messages: chat with parents and staff inside the app.",
  "/fees":
    "Fees: tabs Fee structure (fee items and amounts per class; Copy fees from another term), Invoices (create invoices for a class or student, send them), Payments (record cash or transfer payments, issue receipts; parents can also pay online), Debtors (who owes, Email reminders or SMS), Discounts (scholarships, sibling discounts). Online payments go to the school's bank account set in Settings → Payments.",
  "/expenses": "Expenses: record spending by category; the income statement compares fees collected with spending.",
  "/payroll": "Payroll: set each staff member's pay (basic, allowances, deductions, PAYE and pension), run payroll for the month, and publish payslips that staff see under Attendance & leave → My payslips.",
  "/staff": "Staff: everyone who works at the school. Invite a staff member by email with a role; they get an invitation link to set their password. Pending invitations can be resent or cancelled.",
  "/hr": "Attendance & leave: My day (clock in and out), Leave requests (apply, and approvers approve), and My payslips. Managers see staff attendance and leave for everyone.",
  "/documents": "Documents: ID cards, testimonials, certificates, transcripts and letters, each with a QR code anyone can scan to verify it.",
  "/inventory": "Inventory: stock items and assets, stock in, issue out, sign assets out and back, stock counts, and low-stock warnings.",
  "/roles": "Roles & permissions: the built-in roles and their permissions, and custom roles (Premium) with exactly the permissions you choose. Assign roles to staff from here or from Staff.",
  "/audit": "Audit log: who did what and when, for the school's records.",
  "/settings":
    "Settings: School profile (name, logo, motto, contacts, admission number prefix), AI & Kola (switch AI helpers on or off, let parents ask Kola), Payments (bank account for online fees, fee rules), Messaging (SMS sender and credits), Admissions, Staff & HR, Payroll, Behaviour, Library, Inventory, Sick bay, Transport, Boarding, Documents, Plan & billing (change plan, pay for SchoolHub), Add-ons, Web address, Campuses, Staff sign-in, API & webhooks, Data & privacy (export all the school's data).",
};

export const KOLA_GENERAL = `General: SchoolHub works on phones and computers; on a phone the menu is behind the button at the top left. Plans are Free, Basic, Standard, Premium and Enterprise; a page with a lock needs a higher plan (Settings → Plan & billing). Parents sign in at /parent with their phone number or email and a code; students sign in at /student with the school code, admission number and password. Forgot password: use "Forgot password?" on the login page. A new school's first steps: complete the School profile, set up Classes & subjects (classes, subjects, the current session and term), add students (Import from Excel is fastest), invite staff, then set fees.`;

/** The parent app, for Kola in the parent portal. */
export const KOLA_PARENT_GUIDE = `The parent app has four tabs: Home (/p), Messages (/p/messages), Updates (/p/notifications) and Account (/p/account). On a phone they are along the bottom.
Home lists your children; open a child to see their page. A child's page has sections (only those the school uses appear): Attendance (days present, absent, late), Timetable (the class week), Homework (assignments and whether they were handed in), Conduct (merits and incidents), Health (sick bay visits and health notes), Bus (route and pick-up), Hostel (boarding, and the Ask for an exeat button to request leave), Results (scores and Report cards; some schools ask you to clear the term's fees before results show), Fees (invoices, what's paid and owed; the Pay button pays online by card, bank transfer or USSD and gives a receipt), News (the school's announcements and School calendar).
To talk to a teacher: open the child and tap Message the teacher, or go to Messages → New message.
Updates shows alerts from the school (results published, fees due, absences).
Account: your name, phone and email, and How should schools reach you? (email, SMS). Sign out is there too.
Signing in: parents sign in at /parent with the phone number or email the school has, and a code sent to them. If a child is missing or details are wrong, the school must update them: message the school.`;
