import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Kola } from "@/components/illustrations/art";
import { Card } from "@/components/ui/display";
import { getDb } from "@/lib/db/client";
import { formatNaira } from "@/lib/money";
import { getApplyPage } from "@/lib/services/admissions";
import { ApplyForm } from "./apply-form";
import { SchoolBrand } from "./school-brand";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getApplyPage(getDb(), slug);
  return { title: page ? `Apply to ${page.school.name}` : "Apply" };
}

/** A school's public admission form. No account needed. */
export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getApplyPage(getDb(), slug);
  if (!page) notFound();
  return (
    <div className="min-h-dvh bg-paper px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
        <SchoolBrand school={page.school} />
        <div>
          <h1 className="fs-28 font-bold tracking-[-0.02em] text-ink">Apply for admission{page.session ? `, ${page.session}` : ""}</h1>
          {page.intro ? <p className="mt-2 whitespace-pre-wrap fs-15.5 leading-relaxed text-body">{page.intro}</p> : null}
        </div>
        {!page.open ? (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <Kola className="h-28 w-auto" />
            <h2 className="fs-19 font-bold">Applications are closed for now</h2>
            <p className="max-w-[44ch] fs-15 text-muted">
              {page.school.name} isn&apos;t taking applications at the moment. Please check back later{page.school.phone ? ` or call ${page.school.phone}` : ""}.
            </p>
          </Card>
        ) : (
          <>
            {page.feeKobo || (page.examInfo && (page.assessment === "exam" || page.assessment === "both")) ? (
              <Card className="flex flex-col gap-2 border-brand/30 bg-brand-wash/40 p-4 fs-14.5 text-body">
                {page.feeKobo ? (
                  <p>
                    Application fee: <strong className="text-ink">{formatNaira(page.feeKobo)}</strong>
                    {page.payOnline ? ", payable online after you apply." : ", payable at the school."}
                  </p>
                ) : null}
                {page.examInfo && (page.assessment === "exam" || page.assessment === "both") ? <p className="whitespace-pre-wrap">Entrance exam: {page.examInfo}</p> : null}
              </Card>
            ) : null}
            <ApplyForm slug={slug} levels={page.levels} feeLabel={page.feeKobo && page.payOnline ? formatNaira(page.feeKobo) : null} />
          </>
        )}
        <p className="text-center fs-12.5 text-muted">Powered by School OS</p>
      </div>
    </div>
  );
}
