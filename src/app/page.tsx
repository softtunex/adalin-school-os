import Link from "next/link";
import { redirect } from "next/navigation";
import { hostSchool } from "@/lib/auth/host";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand";
import { AttendanceScene, FeesScene, Kola, NigeriaScene, ParentsScene, ReportScene } from "@/components/illustrations/art";
import { Illustration } from "@/components/illustrations";
import { ButtonLink } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";
import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/cn";
import { DEFAULT_PLANS, FEATURES } from "@/lib/plans/catalog";
import { formatNaira } from "@/lib/nigeria";

/** How a Nigerian school term runs, and where SchoolHub helps at each point. */
const TERM: { when: string; what: string; detail: string; icon: IconName; tone: string }[] = [
  { when: "Before resumption", what: "Fees go out", detail: "Invoices for every student, payable online in parts.", icon: "wallet", tone: "bg-[#FFF0E6] text-[#B84300]" },
  { when: "Every morning", what: "Register in a minute", detail: "Teachers mark the few who are absent. Parents hear by 9am.", icon: "calendarCheck", tone: "bg-[#E6F4EA] text-[#1E7A34]" },
  { when: "Mid-term", what: "CA tests on CBT", detail: "Set from the question bank, marked automatically.", icon: "monitor", tone: "bg-[#E8F2FB] text-[#14639A]" },
  { when: "End of term", what: "Report cards out", detail: "Scores, positions and comments, approved and published.", icon: "results", tone: "bg-[#F1ECFB] text-[#5B3FB0]" },
];

const SECTIONS: { name: string; label: string; title: string; text: ReactNode; art: ReactNode; points: string[] }[] = [
  {
    name: "attendance",
    label: "Attendance",
    title: "Everyone starts present. Tap the few who aren't.",
    text: "The register takes a minute on any phone. If the network drops, it saves and sends when the signal comes back.",
    art: <AttendanceScene className="w-full" />,
    points: ["Works offline", "Parents told about absences", "Attendance printed on every report card"],
  },
  {
    name: "report-cards",
    label: "Results",
    title: "Report cards without the late nights.",
    text: "Teachers enter CA and exam scores. SchoolHub works out totals, grades and positions, and the principal approves before anything reaches parents.",
    art: <ReportScene className="w-full" />,
    points: ["A1 to F9 grading, or your own", "Result checker PINs", "AI drafts comments for teachers to edit"],
  },
  {
    name: "fees",
    label: "Fees",
    title: "Know who has paid without opening a ledger.",
    text: "Parents pay by card, transfer or USSD straight into the school's account, and receipts go out on their own. Reminders follow up on what's owed.",
    art: <FeesScene className="w-full" />,
    points: ["Paystack to your own account", "Part payments and discounts", "Debtors list for the bursar"],
  },
  {
    name: "parents",
    label: "Parents",
    title: "Parents see what they need, on their phone.",
    text: "Results, attendance, homework and fees for each child, plus messages to the class teacher at hours the school sets.",
    art: <ParentsScene className="w-full" />,
    points: ["Parent app with no password to forget", "SMS and WhatsApp alerts", "Kola answers their how-to questions"],
  },
  {
    name: "nigeria",
    label: "Setup",
    title: "Built around the Nigerian school year.",
    text: "Three terms, sessions, CA and exams, class arms and positions are already there. British and Montessori schools can switch their setup in Settings.",
    art: <NigeriaScene className="w-full" />,
    points: ["Ready from a template in minutes", "Import students from your own Excel list", "Support on WhatsApp in Lagos hours"],
  },
];

const ROLES: { who: string; gets: string; icon: IconName }[] = [
  { who: "Proprietor", gets: "Fees collected, debtors and results progress on one screen.", icon: "building" },
  { who: "Principal", gets: "Approves results and lesson notes, and sees every class.", icon: "shield" },
  { who: "Teacher", gets: "Register, scores, homework and CBT for their own classes only.", icon: "bookOpen" },
  { who: "Bursar", gets: "Invoices, payments, receipts, expenses and payroll.", icon: "wallet" },
  { who: "Parent", gets: "Each child's results, fees and messages, with no password.", icon: "users" },
  { who: "Student", gets: "Homework, CBT tests, materials and their report card.", icon: "graduation" },
];

/** The product itself, drawn in the page: a report card, a payment and today's register. */
function HeroBoard() {
  const rows = [
    ["Mathematics", "86", "A1"],
    ["English Studies", "78", "B2"],
    ["Basic Science", "81", "A1"],
    ["Social Studies", "69", "B3"],
  ];
  return (
    <div className="relative mx-auto w-full max-w-[460px] pb-10 pt-6">
      <div className="rotate-[-1.5deg] rounded-[22px] border border-line bg-canvas p-5 shadow-[0_18px_40px_-18px_rgba(30,20,10,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="fs-12 font-semibold uppercase tracking-[0.08em] text-muted">First term report</p>
            <p className="mt-1 fs-17 font-semibold text-ink">Chiamaka Obi · JSS 1 Gold</p>
          </div>
          <span className="rounded-full bg-[#E6F4EA] px-2.5 py-1 fs-12.5 font-semibold text-[#1E7A34]">3rd of 42</span>
        </div>
        <table className="mt-4 w-full fs-14">
          <tbody>
            {rows.map(([subject, score, grade]) => (
              <tr key={subject} className="border-t border-line">
                <td className="py-2 text-body">{subject}</td>
                <td className="tabular py-2 text-right text-ink">{score}</td>
                <td className="py-2 pl-3 text-right font-semibold text-brand">{grade}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 rounded-[12px] bg-paper px-3 py-2 fs-13 text-body">&ldquo;A focused pupil who has done well in Mathematics. More reading will lift her English.&rdquo;</p>
      </div>
      <div className="absolute -left-2 bottom-2 flex items-center gap-2.5 rounded-[16px] border border-line bg-canvas px-3.5 py-2.5 shadow-[0_10px_24px_-12px_rgba(30,20,10,0.35)] sm:-left-8">
        <span className="grid size-8 place-items-center rounded-full bg-[#E6F4EA] text-[#1E7A34]">
          <Icon name="check" size={16} strokeWidth={3} />
        </span>
        <span className="fs-13.5">
          <span className="block font-semibold text-ink">{formatNaira(8_500_000)} paid</span>
          <span className="text-muted">Second instalment · receipt sent</span>
        </span>
      </div>
      <div className="absolute -right-1 top-0 flex items-center gap-2 rounded-[16px] border border-line bg-canvas px-3 py-2 shadow-[0_10px_24px_-12px_rgba(30,20,10,0.35)] sm:-right-6">
        <Icon name="calendarCheck" size={17} className="text-[#14639A]" />
        <span className="fs-13.5 font-semibold text-ink">38 of 40 present</span>
      </div>
      <Kola className="absolute -bottom-2 right-2 h-24 w-20 sm:-right-4" />
    </div>
  );
}

function Section({ title, label, text, art, name, points, flip }: (typeof SECTIONS)[number] & { flip: boolean }) {
  return (
    <section className="mx-auto grid max-w-[1120px] items-center gap-10 px-5 py-14 md:grid-cols-2 md:gap-16 md:py-20">
      <div className={cn("mx-auto w-full max-w-[420px]", flip && "md:order-2")}>
        <Illustration name={name} fallback={art} className="w-full" />
      </div>
      <div className={cn(flip && "md:order-1")}>
        <p className="fs-13 font-semibold uppercase tracking-[0.1em] text-brand">{label}</p>
        <h2 className="mt-3 max-w-[20ch] font-display fs-34 font-extrabold leading-[1.12] tracking-[-0.015em] text-ink [text-wrap:balance] sm:fs-40">{title}</h2>
        <p className="mt-4 max-w-[50ch] fs-17 leading-relaxed text-body">{text}</p>
        <ul className="mt-6 flex flex-col gap-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-center gap-3 fs-15.5 text-ink">
              <Icon name="check" size={18} strokeWidth={2.6} className="shrink-0 text-success" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default async function HomePage() {
  if (await hostSchool()) redirect("/login");
  const plans = DEFAULT_PLANS.filter((p) => p.key !== "enterprise");
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-3 px-5 sm:h-[72px]">
          <Logo className="max-[380px]:hidden" />
          <Logo compact className="min-[381px]:hidden" />
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#how-it-works" className="hidden px-3 fs-15 font-medium text-body hover:text-ink md:inline">
              How it works
            </a>
            <a href="#pricing" className="hidden px-3 fs-15 font-medium text-body hover:text-ink md:inline">
              Pricing
            </a>
            <Link href="/login" className="hidden px-3 fs-15 font-medium text-body hover:text-ink sm:inline">
              Log in
            </Link>
            <ButtonLink href="/signup" size="sm" className="sm:hidden">
              Start free
            </ButtonLink>
            <ButtonLink href="/signup" size="md" className="max-sm:hidden">
              Start free
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-[1120px] items-center gap-10 px-5 pb-14 pt-10 md:grid-cols-[1.05fr_1fr] md:gap-14 md:pb-20 md:pt-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-brand-wash px-3 py-1.5 fs-13.5 font-semibold text-brand-ink">
              <span className="size-2 rounded-full bg-brand" aria-hidden />
              For nursery, primary and secondary schools
            </p>
            <h1 className="mt-5 max-w-[15ch] font-display fs-40 font-extrabold leading-[1.08] tracking-[-0.02em] text-ink [text-wrap:balance] sm:fs-52">
              Your whole school, in one simple app.
            </h1>
            <p className="mt-5 max-w-[46ch] fs-18 leading-relaxed text-body">
              Attendance, results, fees and parents, set up in an afternoon and used from any phone. Free for schools with up to 50 students.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <ButtonLink href="/signup" size="xl" className="max-sm:w-full">
                Create your school
              </ButtonLink>
              <Link href="/login" className="fs-16 font-semibold text-ink underline decoration-line-strong decoration-2 underline-offset-[6px] hover:decoration-brand max-sm:mx-auto">
                Log in to your school
              </Link>
            </div>
            <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 fs-14 text-muted">
              <span>No card needed</span>
              <span>Works on any phone</span>
              <span>Your data stays yours</span>
            </p>
          </div>
          <HeroBoard />
        </section>

        <section id="how-it-works" className="scroll-mt-20 bg-paper">
          <div className="mx-auto max-w-[1120px] px-5 py-14 md:py-20">
            <h2 className="max-w-[24ch] font-display fs-30 font-extrabold leading-[1.15] tracking-[-0.015em] text-ink [text-wrap:balance] sm:fs-36">A term with {APP_NAME}, from resumption to vacation.</h2>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {TERM.map((t, i) => (
                <li key={t.what} className="relative flex flex-col gap-3 rounded-[18px] border border-line bg-canvas p-5">
                  <div className="flex items-center justify-between">
                    <span className={cn("grid size-11 place-items-center rounded-[13px]", t.tone)}>
                      <Icon name={t.icon} size={21} strokeWidth={2.2} />
                    </span>
                    <span className="tabular fs-13 font-semibold text-muted">{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <p className="fs-13 font-semibold uppercase tracking-[0.08em] text-muted">{t.when}</p>
                  <p className="-mt-1.5 fs-18 font-semibold text-ink">{t.what}</p>
                  <p className="fs-14.5 leading-relaxed text-body">{t.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {SECTIONS.map((s, i) => (
          <Section key={s.name} {...s} flip={i % 2 === 1} />
        ))}

        <section className="border-y border-line bg-paper">
          <div className="mx-auto max-w-[1120px] px-5 py-14 md:py-20">
            <h2 className="max-w-[22ch] font-display fs-30 font-extrabold leading-[1.15] tracking-[-0.015em] text-ink [text-wrap:balance] sm:fs-36">Everyone sees their own part, and only that.</h2>
            <div className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
              {ROLES.map((r) => (
                <div key={r.who} className="flex gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-canvas text-brand ring-1 ring-line">
                    <Icon name={r.icon} size={20} strokeWidth={2.2} />
                  </span>
                  <div>
                    <p className="fs-16.5 font-semibold text-ink">{r.who}</p>
                    <p className="mt-1 fs-14.5 leading-relaxed text-body">{r.gets}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-20">
          <div className="mx-auto max-w-[1120px] px-5 py-16 md:py-24">
            <h2 className="font-display fs-30 font-extrabold leading-[1.15] tracking-[-0.015em] text-ink sm:fs-36">Pricing per student, per term</h2>
            <p className="mt-3 max-w-[56ch] fs-17 text-body">Most schools add it to the fees as a small line. No setup fee, and Standard and Premium come with a free 30-day trial.</p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((p, i) => {
                const popular = p.key === "standard";
                const previous = plans[i - 1];
                const added = previous ? p.features.filter((f) => !previous.features.includes(f)) : p.features;
                return (
                  <div key={p.key} className={cn("relative flex flex-col rounded-[20px] border bg-canvas p-6", popular ? "border-brand ring-2 ring-brand/25" : "border-line")}>
                    {popular ? <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-0.5 fs-12.5 font-semibold text-white">Most schools</span> : null}
                    <h3 className="fs-18 font-semibold text-ink">{p.name}</h3>
                    <p className="tabular mt-2 fs-30 font-bold tracking-[-0.02em] text-ink">{p.pricePerStudentKobo ? formatNaira(p.pricePerStudentKobo) : "Free"}</p>
                    <p className="fs-13.5 text-muted">{p.pricePerStudentKobo ? "per student, per term" : `up to ${p.limits.students} students and ${p.limits.staff} staff`}</p>
                    <ButtonLink href="/signup" variant={popular ? "primary" : "outline"} className="mt-5">
                      {p.key === "standard" || p.key === "premium" ? "Try free for 30 days" : "Start free"}
                    </ButtonLink>
                    <ul className="mt-6 flex flex-col gap-2 border-t border-line pt-5 fs-14">
                      {previous ? <li className="text-muted">Everything in {previous.name}, plus:</li> : null}
                      {added.map((f) => (
                        <li key={f} className="flex gap-2 text-body">
                          <Icon name="check" size={16} strokeWidth={2.6} className="mt-0.5 shrink-0 text-success" />
                          {FEATURES[f]}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <p className="mt-8 fs-15 text-muted">Running several campuses? Enterprise adds group dashboards, your own web address, single sign-on and an account manager.</p>
          </div>
        </section>

        <section className="px-5 pb-20">
          <div className="mx-auto flex max-w-[1120px] flex-col items-start gap-6 overflow-hidden rounded-[28px] bg-brand-wash px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-12 sm:py-12">
            <div className="flex items-center gap-5">
              <Kola className="hidden h-24 w-20 shrink-0 sm:block" />
              <div>
                <h2 className="max-w-[22ch] font-display fs-28 font-extrabold leading-[1.15] tracking-[-0.015em] text-ink sm:fs-32">Start next term on {APP_NAME}.</h2>
                <p className="mt-2 fs-16 text-body">Set up your classes this week. Import students from the Excel list you already have.</p>
              </div>
            </div>
            <ButtonLink href="/signup" size="xl" className="shrink-0 max-sm:w-full">
              Create your school
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className="bg-[#1d1a17] text-white">
        <div className="mx-auto grid max-w-[1120px] gap-10 px-5 py-14 sm:grid-cols-2 md:grid-cols-4">
          <div className="sm:col-span-2 md:col-span-1">
            <p className="font-display fs-24 font-extrabold">
              adalin <span className="text-[#FF8A47]">schoolhub</span>
            </p>
            <p className="mt-2 max-w-[30ch] fs-14.5 text-white/75">School management for Nigerian schools, by Adalin Technologies in Lagos.</p>
          </div>
          {[
            { title: "Product", links: [["How it works", "/#how-it-works"], ["Pricing", "/#pricing"], ["Create your school", "/signup"]] },
            { title: "Company", links: [["Adalin Technologies", "https://adalintechnologies.com"], ["Privacy", "/privacy"], ["Terms", "/terms"]] },
            { title: "Account", links: [["Log in", "/login"], ["Parents", "/parent"], ["Students", "/student"]] },
          ].map((col) => (
            <div key={col.title}>
              <p className="fs-14 font-semibold text-white">{col.title}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="fs-14.5 text-white/75 underline-offset-4 hover:text-white hover:underline">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-[1120px] px-5 py-5 fs-13.5 text-white/60">© {new Date().getFullYear()} Adalin Technologies · Lagos, Nigeria</p>
        </div>
      </footer>
    </div>
  );
}
