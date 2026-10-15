import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand";
import { AttendanceScene, FeesScene, HeroScene, NigeriaScene, ParentsScene, ReportScene } from "@/components/illustrations/art";
import { Illustration } from "@/components/illustrations";
import { ButtonLink } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";
import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/cn";
import { DEFAULT_PLANS } from "@/lib/plans/catalog";
import { formatNaira } from "@/lib/nigeria";

const SCHOOL_TYPES: { icon: IconName; label: string; color: string }[] = [
  { icon: "star", label: "Nursery", color: "bg-[#F28BC1]" },
  { icon: "bookOpen", label: "Primary", color: "bg-[#1A8FD6]" },
  { icon: "graduation", label: "Secondary", color: "bg-[#FE6007]" },
  { icon: "building", label: "British", color: "bg-[#7C5CDB]" },
  { icon: "layers", label: "Montessori", color: "bg-[#2BB24C]" },
  { icon: "users", label: "School groups", color: "bg-[#FFC83D]" },
];

const SECTIONS: { name: string; title: string; text: ReactNode; art: ReactNode; points: string[] }[] = [
  {
    name: "attendance",
    title: "attendance in one tap",
    text: "Everyone starts present. Teachers tap the few who aren't, on any phone. No network? It saves and syncs when the signal comes back.",
    art: <AttendanceScene className="w-full" />,
    points: ["Works offline", "Absence alerts to parents", "Termly attendance on every report card"],
  },
  {
    name: "report-cards",
    title: "report cards that write themselves",
    text: "Teachers enter CA and exam scores. Totals, grades, class positions and principal's comments come together into branded report cards.",
    art: <ReportScene className="w-full" />,
    points: ["WAEC-style A1 to F9 grading", "Approval before publishing", "Result checker PINs"],
  },
  {
    name: "fees",
    title: "fees that chase themselves",
    text: "Bill every student in seconds, let parents pay online in instalments, and let polite reminders do the following up for you.",
    art: <FeesScene className="w-full" />,
    points: ["Paystack straight to your account", "Receipts sent automatically", "Debtors list at a glance"],
  },
  {
    name: "parents",
    title: "parents in the loop",
    text: "Results, attendance, fees and messages from the class teacher, on the parent's phone. Fewer calls to the office, happier families.",
    art: <ParentsScene className="w-full" />,
    points: ["Parent app", "SMS and WhatsApp alerts", "Messaging with set hours"],
  },
  {
    name: "nigeria",
    title: "made for schools like yours",
    text: "Three terms, sessions, CA and exams, positions and WAEC grading come built in, with British and Montessori setups ready too. And when you need help, we're on WhatsApp in Lagos time.",
    art: <NigeriaScene className="w-full" />,
    points: ["Set up in minutes from a template", "Each role sees only their part", "Real support, real people"],
  },
];

function Section({ title, text, art, name, points, flip }: (typeof SECTIONS)[number] & { flip: boolean }) {
  return (
    <section className="mx-auto grid max-w-[1120px] items-center gap-10 px-5 py-16 md:grid-cols-2 md:gap-16 md:py-24">
      <div className={cn("mx-auto w-full max-w-[460px]", flip && "md:order-2")}>
        <Illustration name={name} fallback={art} className="w-full" />
      </div>
      <div className={cn(flip && "md:order-1")}>
        <h2 className="font-display text-[40px] font-black leading-[1.05] tracking-[-0.02em] text-brand sm:text-[52px]">{title}</h2>
        <p className="mt-5 max-w-[48ch] text-[18px] leading-relaxed text-body">{text}</p>
        <ul className="mt-6 flex flex-col gap-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-center gap-3 text-[16px] font-medium text-ink">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success text-white shadow-[0_2px_0_var(--success-deep)]">
                <Icon name="check" size={14} strokeWidth={3} />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function HomePage() {
  const plans = DEFAULT_PLANS.filter((p) => p.key !== "enterprise");
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1120px] items-center justify-between px-5">
          <Logo />
          <nav className="flex items-center gap-2">
            <Link href="/login" className="hidden px-3 text-[14px] font-bold uppercase tracking-[0.06em] text-muted hover:text-ink sm:inline">
              Log in
            </Link>
            <ButtonLink href="/signup" size="md" className="uppercase tracking-[0.06em]">
              Get started
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-[1120px] items-center gap-8 px-5 pb-16 pt-10 md:grid-cols-[1.1fr_1fr] md:gap-12 md:pb-20 md:pt-16">
          <div className="mx-auto w-full max-w-[540px]">
            <Illustration name="hero" fallback={<HeroScene className="w-full" />} className="w-full" priority />
          </div>
          <div className="flex flex-col items-center text-center">
            <h1 className="max-w-[16ch] font-display text-[34px] font-black leading-[1.15] tracking-[-0.01em] text-ink sm:text-[40px]">
              The simplest way to run your whole school.
            </h1>
            <p className="mt-4 max-w-[42ch] text-[17px] text-body">Attendance, results, fees and parents in one place. Free for schools with up to 50 students.</p>
            <div className="mt-8 flex w-full max-w-[360px] flex-col gap-3">
              <ButtonLink href="/signup" size="xl">
                Get started
              </ButtonLink>
              <ButtonLink href="/login" variant="outline" size="xl">
                I already have an account
              </ButtonLink>
            </div>
          </div>
        </section>

        <div className="border-y border-line">
          <div className="mx-auto flex max-w-[1120px] gap-3 overflow-x-auto px-5 py-5 [scrollbar-width:none] md:justify-between">
            {SCHOOL_TYPES.map((t) => (
              <span key={t.label} className="flex shrink-0 items-center gap-2.5 px-2 text-[14px] font-bold uppercase tracking-[0.06em] text-muted">
                <span className={cn("grid size-9 place-items-center rounded-[10px] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.15)]", t.color)}>
                  <Icon name={t.icon} size={18} strokeWidth={2.2} />
                </span>
                {t.label}
              </span>
            ))}
          </div>
        </div>

        <section className="mx-auto max-w-[1120px] px-5 pt-20 text-center md:pt-28">
          <h2 className="font-display text-[44px] font-black leading-[1.05] tracking-[-0.02em] text-brand sm:text-[60px]">simple. fast. complete.</h2>
          <p className="mx-auto mt-5 max-w-[56ch] text-[18px] leading-relaxed text-body">
            Most school software is built to tick feature boxes. {APP_NAME} is built for the teacher with 40 students, a phone and five minutes. Every role gets its own simple view, so nobody wades through screens they don&apos;t need.
          </p>
        </section>

        {SECTIONS.map((s, i) => (
          <Section key={s.name} {...s} flip={i % 2 === 1} />
        ))}

        <section className="bg-paper">
          <div className="mx-auto max-w-[1120px] px-5 py-20 md:py-24">
            <h2 className="text-center font-display text-[40px] font-black leading-[1.05] tracking-[-0.02em] text-brand sm:text-[52px]">fair, simple pricing</h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-center text-[17px] text-body">Per student, per term. Most schools add it to the fees as a small line. No setup fee.</p>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((p) => {
                const popular = p.key === "standard";
                return (
                  <div
                    key={p.key}
                    className={cn("relative flex flex-col rounded-[20px] border-2 bg-canvas p-6", popular ? "border-brand shadow-[0_6px_0_var(--brand)]" : "border-line shadow-[0_6px_0_var(--line)]")}
                  >
                    {popular ? <span className="absolute -top-3.5 left-6 rounded-full bg-brand px-3 py-1 text-[12px] font-bold uppercase tracking-[0.06em] text-white">Most schools</span> : null}
                    <h3 className="font-display text-[22px] font-black">{p.name}</h3>
                    <p className="tabular mt-3 text-[30px] font-bold tracking-[-0.02em] text-ink">
                      {p.pricePerStudentKobo ? formatNaira(p.pricePerStudentKobo) : "Free"}
                    </p>
                    <p className="text-[13.5px] text-muted">{p.pricePerStudentKobo ? "per student, per term" : `up to ${p.limits.students} students`}</p>
                    <ButtonLink href="/signup" variant={popular ? "primary" : "outline"} className="mt-6">
                      {p.pricePerStudentKobo ? "Start free" : "Get started"}
                    </ButtonLink>
                  </div>
                );
              })}
            </div>
            <p className="mt-8 text-center text-[15px] text-muted">Running several campuses? Enterprise adds group dashboards, your own domain and an account manager.</p>
          </div>
        </section>

        <section className="mx-auto flex max-w-[1120px] flex-col items-center px-5 py-20 text-center md:py-28">
          <h2 className="max-w-[18ch] font-display text-[40px] font-black leading-[1.08] tracking-[-0.02em] text-ink sm:text-[52px]">Spend your evenings on something better than paperwork.</h2>
          <ButtonLink href="/signup" size="xl" className="mt-10 w-full max-w-[360px]">
            Get started free
          </ButtonLink>
        </section>
      </main>

      <footer className="bg-brand text-white">
        <div className="mx-auto grid max-w-[1120px] gap-10 px-5 py-14 sm:grid-cols-2 md:grid-cols-4">
          <div className="sm:col-span-2 md:col-span-1">
            <p className="font-display text-[26px] font-black">{APP_NAME.toLowerCase()}</p>
            <p className="mt-2 max-w-[30ch] text-[14.5px] text-white/85">School management for schools that want their evenings back.</p>
          </div>
          {[
            { title: "Product", links: [["Features", "/#"], ["Pricing", "/#"], ["Get started", "/signup"]] },
            { title: "Company", links: [["Adalin Technologies", "https://adalintechnologies.com"], ["Contact", "/#"]] },
            { title: "Account", links: [["Log in", "/login"], ["Create a school", "/signup"]] },
          ].map((col) => (
            <div key={col.title}>
              <p className="text-[14px] font-bold text-white">{col.title}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="text-[14.5px] text-[#FFD9C2] hover:text-white">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/20">
          <p className="mx-auto max-w-[1120px] px-5 py-5 text-[13.5px] text-white/80">
            © {new Date().getFullYear()} Adalin Technologies · Lagos, Nigeria
          </p>
        </div>
      </footer>
    </div>
  );
}
