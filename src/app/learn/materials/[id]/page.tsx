import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileLinks } from "@/components/file-uploader";
import { buttonClass } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatWhen } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { getStudentMaterial } from "@/lib/services/materials";

export const metadata: Metadata = { title: "Material" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudentMaterial({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await requireUser();
  const d = await getStudentMaterial(getDb(), user.id, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const m = d.m;
  return (
    <div className="flex flex-col gap-5">
      <Link href="/learn/materials" className="inline-flex items-center gap-1.5 self-start fs-14 font-semibold text-muted hover:text-ink">
        <Icon name="chevronLeft" size={16} /> Materials
      </Link>
      <Card className="flex flex-col gap-4 p-5">
        <div>
          <p className="fs-13.5 font-semibold text-muted">{d.subjectName ?? "General"}</p>
          <h1 className="fs-22 font-bold tracking-[-0.01em] text-ink">{m.title}</h1>
          <p className="fs-13.5 text-muted">
            {d.author ? `${d.author} · ` : ""}
            {formatWhen(m.createdAt)}
          </p>
        </div>
        {m.description ? <p className="fs-15 text-body">{m.description}</p> : null}
        {d.youtube ? (
          <div className="aspect-video w-full max-w-full overflow-hidden rounded-chunk bg-ink">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${d.youtube}?rel=0`}
              title={m.title}
              className="h-full w-full"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
            />
          </div>
        ) : null}
        {m.kind === "link" && m.url ? (
          <a href={m.url} target="_blank" rel="noopener noreferrer" className={buttonClass(d.youtube ? "secondary" : "primary", "md", "self-start")}>
            <Icon name="link" size={17} /> {d.youtube ? "Open on YouTube" : "Open the link"}
          </a>
        ) : null}
        {m.kind === "note" && m.body ? <div className="max-w-[70ch] whitespace-pre-wrap fs-16 leading-relaxed text-ink">{m.body}</div> : null}
        <FileLinks files={d.files} />
      </Card>
    </div>
  );
}
