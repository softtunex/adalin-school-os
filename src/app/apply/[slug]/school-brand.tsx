import { initials } from "@/components/ui/display";

/** The school's name and logo at the top of its public pages. */
export function SchoolBrand({ school, caption }: { school: { name: string; logoUrl: string | null; city: string | null; state: string | null }; caption?: string }) {
  return (
    <div className="flex items-center gap-3">
      {school.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={school.logoUrl} alt="" className="size-14 rounded-full border border-line object-cover" />
      ) : (
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-brand fs-19 font-bold text-white shadow-[0_3px_0_var(--brand-deep)]">{initials(school.name)}</span>
      )}
      <div className="min-w-0">
        <p className="truncate fs-19 font-bold text-ink">{school.name}</p>
        <p className="fs-14 text-muted">{caption ?? ([school.city, school.state].filter(Boolean).join(", ") || "Admissions")}</p>
      </div>
    </div>
  );
}
