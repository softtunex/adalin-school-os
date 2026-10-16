import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { ImportFlow } from "./import-flow";

export const metadata: Metadata = { title: "Import students" };

export default async function ImportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requirePageAccess(slug, ["students:import"]);
  return (
    <>
      <Topbar
        title={
          <span className="flex items-center gap-2">
            <Link href={`/s/${slug}/students`} className="text-muted hover:text-ink">
              Students
            </Link>
            <Icon name="chevronRight" size={18} className="text-muted" />
            Import
          </span>
        }
      />
      <PageBody>
        <ImportFlow slug={slug} />
      </PageBody>
    </>
  );
}
