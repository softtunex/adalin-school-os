import type { ReactNode } from "react";
import { Logo } from "@/components/brand";
import { Icon, type IconName } from "@/components/ui/icons";

const POINTS: { icon: IconName; title: string; text: string }[] = [
  { icon: "checkCircle", title: "Attendance in seconds", text: "Everyone starts present. Tap the few who aren't." },
  { icon: "results", title: "Report cards that compute themselves", text: "Scores in, positions and grades out." },
  { icon: "wallet", title: "Fees that chase themselves", text: "Parents pay online, receipts send automatically." },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <main className="flex flex-col px-5 pb-10 pt-6 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">{children}</div>
      </main>
      <aside className="relative hidden overflow-hidden bg-brand p-12 text-white lg:flex lg:flex-col lg:justify-center">
        <div aria-hidden className="absolute -right-24 -top-24 size-80 rounded-full bg-white/10" />
        <div aria-hidden className="absolute -bottom-32 -left-16 size-96 rounded-full bg-black/10" />
        <div className="relative max-w-[440px]">
          <p className="label-caps text-white/80">For schools that want their evenings back</p>
          <h2 className="mt-3 text-[40px] font-black leading-[1.05] tracking-[-0.03em] text-white">One place for the whole school.</h2>
          <ul className="mt-10 flex flex-col gap-4">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-4 rounded-card bg-white/12 p-4 backdrop-blur-[1px]">
                <span className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-white text-brand shadow-[0_3px_0_rgba(0,0,0,0.18)]">
                  <Icon name={p.icon} size={22} strokeWidth={2.4} />
                </span>
                <span>
                  <span className="block text-[16px] font-extrabold">{p.title}</span>
                  <span className="text-[14.5px] text-white/85">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
