import Link from "next/link";

/** The box a school ticks to accept our terms, privacy notice and data processing agreement. */
export function TermsConsent({ error }: { error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex cursor-pointer items-start gap-3 fs-14.5 text-body">
        <input type="checkbox" name="terms" required aria-invalid={!!error} aria-describedby={error ? "terms-error" : undefined} className="mt-1 size-[18px] shrink-0 accent-[var(--brand)]" />
        <span>
          I can act for this school, and it accepts the{" "}
          <Link href="/terms" target="_blank" className="font-semibold text-blue hover:underline">
            terms
          </Link>
          ,{" "}
          <Link href="/privacy" target="_blank" className="font-semibold text-blue hover:underline">
            privacy notice
          </Link>{" "}
          and{" "}
          <Link href="/dpa" target="_blank" className="font-semibold text-blue hover:underline">
            data processing agreement
          </Link>
          .
        </span>
      </label>
      {error ? (
        <p id="terms-error" className="fs-13.5 font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const TERMS_REQUIRED = "Tick the box to accept the terms before creating the school.";
