import type { Metadata } from "next";
import { FileLinks } from "@/components/file-uploader";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { FilterSelect, Pagination, SearchInput } from "@/components/ui/data";
import { EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatWhen } from "@/lib/dates";
import { hasFeature } from "@/lib/plans/entitlements";
import { listMaterials, MATERIAL_PAGE_SIZE } from "@/lib/services/materials";
import { KIND } from "./kinds";
import { AddMaterialButton, MaterialActions } from "./materials-client";

export const metadata: Metadata = { title: "Learning materials" };

type SP = { level?: string; subject?: string; kind?: string; q?: string; page?: string };

export default async function MaterialsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["teaching:lessons"]);
  if (!hasFeature(access.plan, "lms")) {
    return (
      <>
        <Topbar title="Learning materials" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="lms" text="Share slides, worksheets, YouTube lessons and notes with each class. Students open them from their portal, on any phone." />
        </PageBody>
      </>
    );
  }
  const page = Number(sp.page) || 1;
  const list = await listMaterials(getDb(), access, { levelId: sp.level, subjectId: sp.subject, kind: sp.kind, q: sp.q, page });
  const filtered = Boolean(sp.level || sp.subject || sp.kind || sp.q);

  return (
    <>
      <Topbar title="Learning materials" context={access.school.name} actions={<AddMaterialButton slug={slug} options={list.options} />} />
      <PageBody>
        <StatGrid>
          <StatCard label="Shared" value={list.stats.total} icon="layers" tone="brand" caption={`${list.stats.thisWeek} this week`} />
          <StatCard label="Files" value={list.stats.files} icon="file" tone="blue" caption="Slides, PDFs, worksheets" />
          <StatCard label="Links and videos" value={list.stats.links} icon="link" tone="violet" caption="YouTube plays inline" />
          <StatCard label="Notes" value={list.stats.notes} icon="edit" tone="success" caption="Typed for students" />
        </StatGrid>
        <TableCard
          title="Materials"
          toolbar={
            <>
              <SearchInput placeholder="Search materials…" />
              <FilterSelect label="Class" param="level" options={list.levels.map((l) => ({ value: l.id, label: l.name }))} />
              <FilterSelect label="Subject" param="subject" options={list.subjects.map((s) => ({ value: s.id, label: s.name }))} />
              <FilterSelect label="Type" param="kind" options={(Object.keys(KIND) as (keyof typeof KIND)[]).map((k) => ({ value: k, label: KIND[k].label }))} />
            </>
          }
          footer={<Pagination page={page} pageSize={MATERIAL_PAGE_SIZE} total={list.total} noun="materials" />}
        >
          {list.rows.length === 0 ? (
            <EmptyState icon="layers" title={filtered ? "Nothing matches these filters" : "Nothing shared yet"}>
              {filtered
                ? "Try a different search or clear the filters."
                : list.options.length
                  ? "Share slides, worksheets, YouTube lessons or typed notes. Students in that class see them in their portal."
                  : "You'll be able to share materials once you're assigned to teach a subject."}
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Material</Th>
                  <Th>Class</Th>
                  <Th>Shared</Th>
                  <Th className="w-12">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => {
                  const k = KIND[r.m.kind];
                  return (
                    <tr key={r.m.id} className="align-top hover:bg-paper">
                      <Td>
                        <div className="flex gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-chunk bg-brand-wash text-brand">
                            <Icon name={r.youtube ? "monitor" : k.icon} size={18} />
                          </span>
                          <div className="min-w-0">
                            <span className="block font-medium text-ink">{r.m.title}</span>
                            {r.m.description ? <span className="block fs-13.5 text-muted">{r.m.description}</span> : null}
                            {r.m.kind === "link" && r.m.url ? (
                              <a href={r.m.url} target="_blank" rel="noopener noreferrer" className="block max-w-[44ch] truncate fs-13.5 text-blue hover:underline">
                                {r.youtube ? "YouTube video" : r.m.url}
                              </a>
                            ) : null}
                            {r.m.kind === "note" ? <span className="line-clamp-1 max-w-[52ch] fs-13.5 text-muted">{r.m.body}</span> : null}
                            <FileLinks files={r.files} className="mt-2" />
                          </div>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-body">
                        {r.levelName}
                        <span className="block fs-13 text-muted">{r.subjectName ?? "General"}</span>
                      </Td>
                      <Td className="whitespace-nowrap text-body">
                        {formatWhen(r.m.createdAt)}
                        {r.author ? <span className="block fs-13 text-muted">{r.author}</span> : null}
                      </Td>
                      <Td className="text-right">
                        <MaterialActions
                          slug={slug}
                          options={list.options}
                          editing={{
                            id: r.m.id,
                            levelId: r.m.levelId ?? "",
                            subjectId: r.m.subjectId ?? "",
                            title: r.m.title,
                            description: r.m.description,
                            kind: r.m.kind,
                            url: r.m.url,
                            body: r.m.body,
                            files: r.files,
                          }}
                        />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </TableCard>
      </PageBody>
    </>
  );
}
