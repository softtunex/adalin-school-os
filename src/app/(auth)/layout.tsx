import type { ReactNode } from "react";
import { Logo } from "@/components/brand";
import { Kola } from "@/components/illustrations/art";
import { Illustration } from "@/components/illustrations";
import { SchoolMark } from "@/components/school-mark";
import { hostSchool } from "@/lib/auth/host";
import { brandOf, brandStyle } from "@/lib/brand";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const school = await hostSchool();
  if (school) {
    // The school's own web address: its name, logo and colour, not ours.
    return (
      <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" style={brandStyle(brandOf(school, school.features))}>
        <main className="flex flex-col px-5 pb-10 pt-6 sm:px-10">
          <SchoolMark name={school.name} logoUrl={school.logoUrl} />
          <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">{children}</div>
        </main>
        <aside className="relative hidden overflow-hidden bg-brand-wash lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12">
          <div aria-hidden className="absolute -right-24 -top-24 size-96 rounded-full bg-brand/10" />
          <div aria-hidden className="absolute -bottom-32 -left-20 size-[28rem] rounded-full bg-brand/[0.07]" />
          <h2 className="relative max-w-[440px] text-center font-display fs-40 font-black leading-[1.05] tracking-[-0.02em] text-brand">{school.name}</h2>
        </aside>
      </div>
    );
  }
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
          <h2 className="mt-8 font-display fs-40 font-black leading-[1.05] tracking-[-0.02em] text-brand">your whole school, one place</h2>
          <p className="mt-4 fs-16.5 text-body">Attendance in one tap, report cards that build themselves, and fees that chase themselves.</p>
        </div>
      </aside>
    </div>
  );
}
