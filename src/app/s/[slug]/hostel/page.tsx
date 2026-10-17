import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { FilterSelect, SearchInput, ToolbarLink } from "@/components/ui/data";
import { Badge, Card, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { formatNaira } from "@/lib/money";
import { hasFeature } from "@/lib/plans/entitlements";
import type { Access } from "@/lib/services/access";
import { lagosToday } from "@/lib/services/attendance";
import { canBillExtras } from "@/lib/services/extra-charges";
import { EXEAT_KIND_LABEL, EXEAT_STATUS_LABEL, GENDER_LABEL, hostelOverview, hostelStudents, listBoarders, listExeats, when } from "@/lib/services/hostel";
import { AddHostelButton, BillBoardingButton, BoarderActions, ExeatButtons, GiveBedButton, HostelActions, NewExeatButton, RoomActions } from "./hostel-client";

export const metadata: Metadata = { title: "Hostel" };

type SP = { tab?: string; q?: string; hostel?: string; view?: string };
type Overview = Awaited<ReturnType<typeof hostelOverview>>;

const STATUS_TONE = { pending: "warning", approved: "blue", declined: "danger", out: "violet", back: "success", cancelled: "neutral" } as const;

export default async function HostelPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["operations:hostel"]);
  if (!hasFeature(access.plan, "hostel")) {
    return (
      <>
        <Topbar title="Hostel" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="hostel" text="Run boarding: rooms and beds, exeats parents can ask for in the app, and sign-outs at the gate that parents hear about." />
        </PageBody>
      </>
    );
  }
  const tab = ["boarders", "exeats"].includes(sp.tab ?? "") ? sp.tab! : "rooms";
  const base = `/s/${slug}/hostel`;
  const db = getDb();
  const [o, pupils] = await Promise.all([hostelOverview(db, access), hostelStudents(db, access)]);
  const rooms = o.hostels.flatMap((h) => h.rooms.map((r) => ({ id: r.room.id, label: `${h.hostel.name}, ${r.room.name}`, hostelGender: h.hostel.gender, free: r.room.beds - r.occupants.length })));
  return (
    <>
      <Topbar
        title="Hostel"
        context={access.school.name}
        actions={
          <div className="flex flex-wrap gap-2">
            {canBillExtras(access) && o.stats.fees ? <BillBoardingButton slug={slug} total={formatNaira(o.stats.fees)} /> : null}
            {tab === "exeats" ? <NewExeatButton slug={slug} pupils={pupils} minDate={lagosToday()} /> : tab === "boarders" ? <GiveBedButton slug={slug} pupils={pupils} rooms={rooms} /> : <AddHostelButton slug={slug} staff={o.staff} />}
          </div>
        }
      />
      <PageBody>
        <StatGrid>
          <StatCard label="Boarders" value={o.stats.boarders} icon="bed" tone="brand" caption={`${o.hostels.length} hostel${o.hostels.length === 1 ? "" : "s"}`} />
          <StatCard label="Beds free" value={o.stats.bedsFree} icon="check" tone={o.stats.bedsFree ? "success" : "warning"} caption="Across every room" />
          <StatCard label="Out on exeat" value={o.stats.out} icon="send" tone={o.stats.late ? "danger" : "violet"} caption={o.stats.late ? `${o.stats.late} late back` : "Nobody late"} />
          <StatCard label="Waiting for approval" value={o.stats.pending} icon="clock" tone={o.stats.pending ? "warning" : "success"} caption="Exeat requests" />
        </StatGrid>
        <Tabs
          current={tab}
          tabs={[
            { key: "rooms", label: "Rooms", href: base },
            { key: "boarders", label: "Boarders", href: `${base}?tab=boarders`, count: o.stats.boarders },
            { key: "exeats", label: "Exeats", href: `${base}?tab=exeats`, count: o.stats.pending || undefined },
          ]}
        />
        {tab === "boarders" ? <Boarders slug={slug} access={access} sp={sp} o={o} rooms={rooms} /> : tab === "exeats" ? <Exeats slug={slug} access={access} sp={sp} o={o} /> : <Rooms slug={slug} o={o} />}
      </PageBody>
    </>
  );
}

function Rooms({ slug, o }: { slug: string; o: Overview }) {
  if (!o.hostels.length)
    return (
      <Card className="p-6">
        <EmptyState icon="bed" title="No hostels yet">
          Add each hostel with its warden and boarding fee, then its rooms and how many beds each has.
        </EmptyState>
      </Card>
    );
  return (
    <div className="flex flex-col gap-5">
      {o.hostels.map((h) => (
        <Card key={h.hostel.id} className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="fs-17 font-semibold text-ink">{h.hostel.name}</h2>
              <p className="fs-13.5 text-muted">
                {GENDER_LABEL[h.hostel.gender]} · {h.warden ? `Warden: ${h.warden}` : "No warden set"} · {formatNaira(h.hostel.termFeeKobo)} a term
              </p>
            </div>
            <span className="flex items-center gap-2">
              <Badge tone={h.boarders >= h.beds && h.beds ? "warning" : "blue"}>
                {h.boarders} / {h.beds} beds
              </Badge>
              <HostelActions slug={slug} staff={o.staff} hostel={{ id: h.hostel.id, name: h.hostel.name, gender: h.hostel.gender, wardenId: h.hostel.wardenId ?? "", fee: h.hostel.termFeeKobo ? String(h.hostel.termFeeKobo / 100) : "" }} />
            </span>
          </div>
          {h.rooms.length === 0 ? (
            <p className="fs-14.5 text-muted">No rooms yet. Use the menu to add one.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {h.rooms.map(({ room, occupants }) => (
                <div key={room.id} className="flex flex-col gap-2.5 rounded-chunk border border-line bg-paper p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="fs-15 font-semibold text-ink">{room.name}</span>
                    <span className="flex items-center gap-1">
                      <span className="tabular fs-13 text-muted">
                        {occupants.length}/{room.beds}
                      </span>
                      <RoomActions slug={slug} hostelId={h.hostel.id} room={{ id: room.id, name: room.name, beds: room.beds }} />
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1" aria-hidden>
                    {Array.from({ length: room.beds }, (_, i) => (
                      <span key={i} className={cn("size-3 rounded-[3px]", occupants.some((x) => x.bed === i + 1) ? "bg-brand" : "border border-line-strong bg-canvas")} />
                    ))}
                  </div>
                  {occupants.length ? (
                    <ul className="flex flex-col gap-0.5 fs-13.5">
                      {occupants.map((x) => (
                        <li key={x.studentId} className="flex justify-between gap-2">
                          <span className="truncate text-body">
                            <span className="tabular text-muted">{x.bed}.</span> {x.name}
                          </span>
                          <span className="shrink-0 text-muted">{x.className}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="fs-13.5 text-muted">Empty</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

async function Boarders({ slug, access, sp, o, rooms }: { slug: string; access: Access; sp: SP; o: Overview; rooms: { id: string; label: string; hostelGender: string; free: number }[] }) {
  const rows = await listBoarders(getDb(), access, { q: sp.q, hostelId: sp.hostel });
  return (
    <TableCard
      title="Boarders"
      toolbar={
        <>
          <SearchInput placeholder="Student or room…" />
          <FilterSelect label="Hostel" param="hostel" options={o.hostels.map((h) => ({ value: h.hostel.id, label: h.hostel.name }))} />
          <ToolbarLink href={`/s/${slug}/hostel/export${sp.hostel ? `?hostel=${sp.hostel}` : ""}`} icon="download">
            Export
          </ToolbarLink>
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon="bed" title={sp.q || sp.hostel ? "Nobody matches" : "No boarders yet"}>
          {sp.q || sp.hostel ? "Try a different search or hostel." : "Give students a bed with Give a bed."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Student</Th>
              <Th>Hostel</Th>
              <Th>Room</Th>
              <Th className="text-right">Bed</Th>
              <Th>Since</Th>
              <Th className="w-12">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.b.id} className="hover:bg-paper">
                <Td>
                  <span className="block font-medium text-ink">{r.name}</span>
                  <span className="block fs-13 text-muted">{r.className ?? r.admissionNo}</span>
                </Td>
                <Td className="text-body">{r.hostel}</Td>
                <Td className="text-body">{r.room}</Td>
                <Td className="tabular text-right text-body">{r.b.bed}</Td>
                <Td className="whitespace-nowrap text-body">{new Date(`${r.b.since}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</Td>
                <Td className="text-right">
                  <BoarderActions slug={slug} rooms={rooms} boarder={{ id: r.b.studentId, name: r.name, gender: r.gender, roomId: r.roomId }} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </TableCard>
  );
}

async function Exeats({ slug, access, sp, o }: { slug: string; access: Access; sp: SP; o: Overview }) {
  const view = ["pending", "upcoming", "out", "late", "done"].includes(sp.view ?? "") ? sp.view! : o.stats.pending ? "pending" : "upcoming";
  const rows = await listExeats(getDb(), access, { view, q: sp.q });
  const base = `/s/${slug}/hostel?tab=exeats`;
  const now = new Date();
  const chips: [string, string, number?][] = [
    ["pending", "Waiting for approval", o.stats.pending],
    ["upcoming", "Approved"],
    ["out", "Out now", o.stats.out],
    ["late", "Late back", o.stats.late],
    ["done", "Finished"],
  ];
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {chips.map(([k, l, n]) => (
          <Link
            key={k}
            href={`${base}&view=${k}`}
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 fs-13.5 font-medium", view === k ? "border-brand bg-brand-wash text-brand-ink" : "border-line-strong bg-canvas text-body hover:bg-paper")}
          >
            {l}
            {n ? <span className="tabular fs-12.5 text-muted">{n}</span> : null}
          </Link>
        ))}
      </div>
      <TableCard title="Exeats" toolbar={<SearchInput placeholder="Student or reason…" />}>
        {rows.length === 0 ? (
          <EmptyState icon="send" title="Nothing here">
            {view === "pending" ? "Exeat requests from parents land here for approval." : "Try another filter."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Exeat</Th>
                <Th>Leaves</Th>
                <Th>Back by</Th>
                <Th>Status</Th>
                <Th className="w-48">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const late = r.e.status === "out" && r.e.returnBy < now;
                const cameBackLate = r.e.status === "back" && r.e.backAt && r.e.backAt > r.e.returnBy;
                return (
                  <tr key={r.e.id} className="hover:bg-paper">
                    <Td>
                      <span className="block font-medium text-ink">{r.name}</span>
                      <span className="block fs-13 text-muted">{[r.hostel, r.room].filter(Boolean).join(", ")}</span>
                    </Td>
                    <Td className="max-w-72">
                      <span className="block text-ink">{EXEAT_KIND_LABEL[r.e.kind]}</span>
                      <span className="block fs-13 text-muted">
                        {r.e.reason}
                        {r.e.collectedBy ? ` · with ${r.e.collectedBy}` : ""}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-body">{when(r.e.outAt ?? r.e.leaveAt)}</Td>
                    <Td className={cn("whitespace-nowrap", late ? "font-semibold text-danger" : "text-body")}>{when(r.e.backAt ?? r.e.returnBy)}</Td>
                    <Td>
                      <Badge tone={late || cameBackLate ? "danger" : STATUS_TONE[r.e.status]} dot>
                        {late ? "Late back" : cameBackLate ? "Came back late" : EXEAT_STATUS_LABEL[r.e.status]}
                      </Badge>
                      <span className="mt-0.5 block fs-12.5 text-muted">{r.e.requestedByStaff ? "Recorded by staff" : "Asked by parent"}</span>
                    </Td>
                    <Td className="text-right">
                      <ExeatButtons slug={slug} id={r.e.id} status={r.e.status} name={r.name} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </TableCard>
    </>
  );
}
