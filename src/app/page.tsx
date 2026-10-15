import { Logo } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";
import { APP_NAME } from "@/lib/config";

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "checkCircle", title: "Attendance in one tap", text: "Everyone starts present. Mark the few who aren't, even with no network." },
  { icon: "results", title: "Report cards that build themselves", text: "CA and exam scores in. Totals, grades, positions and branded PDFs out." },
  { icon: "wallet", title: "Fees without the chasing", text: "Invoices, online payment, receipts and polite reminders, automatically." },
  { icon: "chat", title: "Parents in the loop", text: "Results, attendance and fees on their phone. Messages to the class teacher." },
  { icon: "shield", title: "Everyone sees only their part", text: "Teachers, bursar, principal, parents. Each role gets its own simple view." },
  { icon: "users", title: "Built for Nigerian schools", text: "Three terms, WAEC grading, result checker PINs, and support on WhatsApp." },
];

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-[1120px] items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Log in
          </ButtonLink>
          <ButtonLink href="/signup" size="sm">
            Get started
          </ButtonLink>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-[1120px] px-5 pb-16 pt-12 sm:pt-20">
          <p className="label-caps text-brand-ink">School management, finally simple</p>
          <h1 className="mt-3 max-w-[16ch] text-[44px] font-black leading-[1.02] tracking-[-0.035em] sm:text-[64px]">
            Run your whole school from one place.
          </h1>
          <p className="mt-5 max-w-[56ch] text-[18px] text-body">
            {APP_NAME} handles attendance, results, report cards, fees and parents, so your staff spend their time on students, not paperwork.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/signup" size="lg">
              Start free
            </ButtonLink>
            <ButtonLink href="/login" variant="secondary" size="lg">
              I have an account
            </ButtonLink>
          </div>
          <p className="mt-4 text-[14px] text-muted">Free for schools with up to 50 students. No card needed.</p>
        </section>

        <section className="border-t-2 border-line bg-paper">
          <div className="mx-auto grid max-w-[1120px] gap-4 px-5 py-16 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-card border-2 border-line bg-canvas p-5">
                <span className="grid size-12 place-items-center rounded-[14px] border-2 border-brand bg-brand-wash text-brand">
                  <Icon name={f.icon} size={22} strokeWidth={2.4} />
                </span>
                <h2 className="mt-4 text-[18px] font-extrabold">{f.title}</h2>
                <p className="mt-1 text-[15px] text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="bg-brand">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-5 py-10 text-white">
          <p className="text-[15px] font-bold">{APP_NAME} by Adalin Technologies</p>
          <p className="text-[14px] text-white/85">Lagos, Nigeria</p>
        </div>
      </footer>
    </div>
  );
}
