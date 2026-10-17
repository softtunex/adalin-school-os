import { requestMeta, requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError, userMessage } from "@/lib/errors";
import { exportPerson, exportSchool } from "@/lib/services/data-export";

/** The whole school's data, or one person's with ?student= or ?staff=. Proprietor only. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["school:export"]);
  const { ip } = await requestMeta();
  const sp = new URL(request.url).searchParams;
  const student = sp.get("student");
  const staff = sp.get("staff");
  try {
    const { filename, stream } =
      student || staff
        ? await exportPerson(getDb(), access, { studentId: student ?? undefined, membershipId: staff ?? undefined }, { userId: access.user.id, name: access.user.name, ip })
        : await exportSchool(getDb(), access, ip);
    return new Response(stream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (!(error instanceof AppError)) console.error("[data-export]", error);
    return new Response(userMessage(error), { status: error instanceof AppError ? 404 : 500 });
  }
}
