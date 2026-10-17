import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Kola } from "@/components/illustrations/art";
import { Alert, initials } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { getDb } from "@/lib/db/client";
import { getSchoolBySlug } from "@/lib/services/schools";
import { CheckButton } from "./check-button";
import { CHECK_ERRORS } from "./errors";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const school = await getSchoolBySlug(getDb(), slug);
  return { title: school ? `Check results · ${school.name}` : "Check results" };
}

export default async function ResultCheckPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ e?: string }> }) {
  const { slug } = await params;
  const { e } = await searchParams;
  const error = e ? (CHECK_ERRORS[e] ?? CHECK_ERRORS.generic) : null;
  const school = await getSchoolBySlug(getDb(), slug);
  if (!school) notFound();

  return (
    <div className="flex min-h-dvh flex-col items-center bg-paper px-4 py-10">
      <div className="w-full max-w-[440px]">
        <div className="flex flex-col items-center text-center">
          {school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logoUrl} alt="" className="size-20 rounded-full border border-line object-cover" />
          ) : (
            <span className="grid size-20 place-items-center rounded-full bg-brand fs-26 font-bold text-white shadow-[0_3px_0_var(--brand-deep)]">{initials(school.name)}</span>
          )}
          <h1 className="mt-4 font-display fs-28 font-black leading-tight">{school.name}</h1>
          {school.motto ? <p className="fs-14 italic text-muted">{school.motto}</p> : null}
          <p className="mt-3 fs-15 text-body">Enter the admission number and the PIN from your result card.</p>
        </div>

        <form action={`/r/${slug}/check`} method="post" className="mt-8 flex flex-col gap-5 rounded-card border border-line bg-canvas p-6 shadow-card">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Admission number" htmlFor="admissionNo">
            <Input id="admissionNo" name="admissionNo" required autoComplete="off" placeholder="e.g. ADC/2026/0042" className="font-mono" />
          </Field>
          <Field label="PIN" htmlFor="pin" hint="12 digits, dashes optional">
            <Input id="pin" name="pin" required inputMode="numeric" autoComplete="off" placeholder="0000-0000-0000" className="font-mono tracking-[0.08em]" />
          </Field>
          <CheckButton />
        </form>

        <div className="mt-10 flex items-center justify-center gap-2 fs-13 text-muted">
          <Kola className="h-7 w-6" /> Powered by School OS
        </div>
      </div>
    </div>
  );
}
