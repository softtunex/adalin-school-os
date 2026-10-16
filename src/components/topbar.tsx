import type { ReactNode } from "react";

/** Page title bar, sticky on desktop. Every in-school page starts with one. */
export function Topbar({ title, context, actions }: { title: ReactNode; context?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="z-20 border-b border-line bg-canvas/95 backdrop-blur lg:sticky lg:top-0">
      <div className="mx-auto flex min-h-[76px] max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <h1 className="min-w-0 fs-22 font-semibold tracking-[-0.015em] text-ink">
          {title}
          {context ? <span className="hidden font-normal text-muted sm:inline"> · {context}</span> : null}
        </h1>
        {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
      </div>
    </header>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 pb-16 pt-6 sm:px-8 sm:pt-8">{children}</div>;
}
