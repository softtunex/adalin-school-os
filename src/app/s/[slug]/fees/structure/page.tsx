import type { Metadata } from "next";
import { PageBody, Topbar } from "@/components/topbar";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/services/access";
import { getFeeSetup } from "@/lib/services/fees";
import { FeesTabs, gated, TermFilter } from "../shared";
import { FeeItemsCard, StructureGrid } from "./structure-editor";
import { termGate } from "@/components/term-gate";

export const metadata: Metadata = { title: "Fee structure" };

export default async function FeeStructurePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ term?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["fees:view"]);
  const gate = await termGate(access, { title: "Fee structure", icon: "banknote", what: "Fee structures" });
  if (gate) return gate;
  const result = await gated(slug, "fees_basic", () => getFeeSetup(getDb(), access, sp.term));
  if ("locked" in result) {
    return (
      <>
        <Topbar title="Fee structure" context={access.school.name} />
        <PageBody>{result.locked}</PageBody>
      </>
    );
  }
  const setup = result.data;
  const editable = can(access, "fees:manage");

  return (
    <>
      <Topbar title="Fee structure" context={access.school.name} />
      <PageBody>
        <FeesTabs slug={slug} current="structure" termId={sp.term} />
        <div className="flex flex-wrap items-center gap-2">
          <TermFilter terms={setup.terms} />
        </div>
        <FeeItemsCard slug={slug} items={setup.items} editable={editable} />
        <StructureGrid
          key={`${setup.term.id}:${JSON.stringify(setup.grid)}:${setup.items.map((i) => i.id + i.isOptional).join()}`}
          slug={slug}
          term={setup.term}
          terms={setup.terms.filter((t) => t.id !== setup.term.id)}
          levels={setup.levels}
          items={setup.items}
          grid={setup.grid}
          invoiced={setup.invoiced}
          editable={editable}
        />
      </PageBody>
    </>
  );
}
