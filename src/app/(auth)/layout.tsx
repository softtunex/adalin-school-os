import type { ReactNode } from "react";
import { Logo } from "@/components/brand";
import { Kola } from "@/components/illustrations/art";
import { Illustration } from "@/components/illustrations";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <main className="flex flex-col px-5 pb-10 pt-6 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">{children}</div>
      </main>
      <aside className="relative hidden overflow-hidden bg-brand-wash lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12">
        <div aria-hidden className="absolute -right-24 -top-24 size-96 rounded-full bg-brand/10" />
        <div aria-hidden className="absolute -bottom-32 -left-20 size-[28rem] rounded-full bg-brand/[0.07]" />
        <div className="relative flex max-w-[440px] flex-col items-center text-center">
          <div className="animate-float w-64">
            <Illustration name="mascot-wave" fallback={<Kola wave className="w-full" />} className="w-full" />
          </div>
          <h2 className="mt-8 font-display text-[40px] font-black leading-[1.05] tracking-[-0.02em] text-brand">your whole school, one place</h2>
          <p className="mt-4 text-[16.5px] text-body">Attendance in one tap, report cards that build themselves, and fees that chase themselves.</p>
        </div>
      </aside>
    </div>
  );
}
