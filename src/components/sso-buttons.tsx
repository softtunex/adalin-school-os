import { cookies } from "next/headers";
import { buttonClass } from "@/components/ui/button-styles";
import { configuredProviders, PROVIDERS, type Provider } from "@/lib/services/sso";

function Mark({ provider }: { provider: Provider }) {
  if (provider === "google") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]">
        <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]">
      <path fill="#F25022" d="M3 3h8.5v8.5H3z" />
      <path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z" />
      <path fill="#00A4EF" d="M3 12.5h8.5V21H3z" />
      <path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z" />
    </svg>
  );
}

/** "Continue with Google / Microsoft", for the providers this server has set up. */
export function SsoButtons({ next, only, mode = "login", divider }: { next?: string; only?: Provider[]; mode?: "login" | "link"; divider?: boolean }) {
  const providers = configuredProviders().filter((p) => !only || only.includes(p));
  if (!providers.length) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {divider ? (
        <div className="my-1 flex items-center gap-3 fs-13 font-semibold text-muted">
          <span aria-hidden className="h-px flex-1 bg-line" />
          or
          <span aria-hidden className="h-px flex-1 bg-line" />
        </div>
      ) : null}
      {providers.map((p) => (
        <a key={p} href={`/api/auth/sso/${p}/start?mode=${mode}${next ? `&next=${encodeURIComponent(next)}` : ""}`} className={buttonClass("secondary", "lg", "w-full")}>
          <Mark provider={p} /> {mode === "link" ? `Connect ${PROVIDERS[p].name}` : `Continue with ${PROVIDERS[p].name}`}
        </a>
      ))}
    </div>
  );
}

/** Why the last Google or Microsoft sign-in didn't work, if it just failed. */
export async function ssoError() {
  return (await cookies()).get("sos_sso_error")?.value ?? null;
}
