import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand";
import { TERMS_UPDATED } from "@/lib/legal";

const DOCS = [
  ["/privacy", "Privacy notice"],
  ["/terms", "Terms of service"],
  ["/dpa", "Data processing agreement"],
] as const;

/** The shared frame for the legal pages: readable width, a contents rail, and links between them. */
export function LegalPage({ title, intro, current, children }: { title: string; intro: ReactNode; current: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[880px] items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Logo />
          <nav className="flex flex-wrap gap-x-4 gap-y-1 fs-14" aria-label="Legal">
            {DOCS.map(([href, label]) => (
              <Link key={href} href={href} aria-current={href === current ? "page" : undefined} className={href === current ? "font-semibold text-ink" : "text-muted hover:text-ink"}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto flex max-w-[720px] flex-col gap-6 px-4 py-10 sm:px-8">
        <div>
          <h1 className="fs-34 font-black tracking-[-0.03em] text-ink">{title}</h1>
          <p className="mt-1 fs-14 text-muted">Last updated {TERMS_UPDATED}</p>
          <div className="mt-4 fs-16 text-body">{intro}</div>
        </div>
        <div className="legal flex flex-col gap-6 fs-15.5 leading-relaxed text-body">{children}</div>
      </main>
    </div>
  );
}

export function Clause({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" id={`s${n}`}>
      <h2 className="fs-19 font-bold text-ink">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}
