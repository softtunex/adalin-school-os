import { Logo } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center gap-5 px-5 text-center">
      <Logo />
      <p className="fs-72 font-black leading-none tracking-[-0.04em] text-brand">404</p>
      <h1 className="fs-26 font-black tracking-[-0.02em]">This page isn&apos;t here</h1>
      <p className="fs-15.5 text-muted">The link may be wrong, or your role may not include this page. If you think you should have access, ask your school admin.</p>
      <ButtonLink href="/schools" variant="secondary">
        Go to my school
      </ButtonLink>
    </div>
  );
}
