import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { FilterSelect, SearchInput, ToolbarLink } from "@/components/ui/data";
import { Badge, Card, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { formatNaira } from "@/lib/money";
import { hasFeature } from "@/lib/plans/entitlements";
import type { Access } from "@/lib/services/access";
import { canBillExtras } from "@/lib/services/extra-charges";
import { lagosClock } from "@/lib/services/hr";
import { DIRECTION_LABEL, getTrip, listRiders, transportOverview, transportStudents } from "@/lib/services/transport";
import { AddRiderButton, BillButton, RiderActions, RouteActions, RouteButton, TripRegister, VehicleActions, VehicleButton } from "./transport-client";

export const metadata: Metadata = { title: "Transport" };

type SP = { tab?: string; q?: string; route?: string; dir?: string };
type Overview = Awaited<ReturnType<typeof transportOverview>>;

export default async function TransportPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["operations:transport"]);
  if (!hasFeature(access.plan, "transport")) {
    return (
      <>
        <Topbar title="Transport" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="transport" text="Run the school buses: routes and stops, who rides where, a bus register parents can follow, and bus fees on the term invoice." />
        </PageBody>
      </>
    );
  }
  const tab = ["riders", "buses", "register"].includes(sp.tab ?? "") ? sp.tab! : "routes";
  const base = `/s/${slug}/transport`;
  const o = await transportOverview(getDb(), access);
  const buses = o.vehicles.map((v) => ({ id: v.id, name: v.name, capacity: v.capacity }));
  return (
    <>
      <Topbar
        title="Transport"
        context={access.school.name}
        actions={
          <div className="flex flex-wrap gap-2">
            {canBillExtras(access) && o.stats.termFees ? <BillButton slug={slug} total={formatNaira(o.stats.termFees)} /> : null}
            {tab === "buses" ? <VehicleButton slug={slug} /> : <RouteButton slug={slug} buses={buses} />}
          </div>
        }
      />
      <PageBody>
        <StatGrid>
          <StatCard label="Routes" value={o.stats.routes} icon="bus" tone="brand" caption={`${o.vehicles.length} bus${o.vehicles.length === 1 ? "" : "es"}`} />
          <StatCard label="Students on buses" value={o.stats.riders} icon="users" tone="blue" caption="Across all routes" />
          <StatCard label="Seats free" value={o.stats.seatsFree} icon="check" tone={o.stats.seatsFree ? "success" : "warning"} caption="On routes with a bus" />
          <StatCard label="Bus fees a term" value={formatNaira(o.stats.termFees)} icon="wallet" tone="violet" caption="If every rider pays" />
        </StatGrid>
        <Tabs
          current={tab}
          tabs={[
            { key: "routes", label: "Routes", href: base, count: o.stats.routes },
            { key: "riders", label: "Students", href: `${base}?tab=riders`, count: o.stats.riders },
            { key: "buses", label: "Buses", href: `${base}?tab=buses`, count: o.vehicles.length },
            { key: "register", label: "Bus register", href: `${base}?tab=register` },
          ]}
        />
        {tab === "riders" ? (
          <Riders slug={slug} access={access} sp={sp} o={o} />
        ) : tab === "buses" ? (
          <Buses slug={slug} o={o} />
        ) : tab === "register" ? (
          <Register slug={slug} access={access} sp={sp} o={o} />
        ) : (
          <Routes slug={slug} o={o} buses={buses} />
        )}
      </PageBody>
    </>
  );
}

function Routes({ slug, o, buses }: { slug: string; o: Overview; buses: { id: string; name: string; capacity: number }[] }) {
  if (!o.routes.length)
    return (
      <Card className="p-6">
        <EmptyState icon="bus" title="No routes yet">
          Add your buses first, then a route for each one with its stops and times.
        </EmptyState>
      </Card>
    );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {o.routes.map(({ route, vehicle, riders }) => {
        const full = vehicle ? riders >= vehicle.capacity : false;
        return (
          <Card key={route.id} className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/s/${slug}/transport?tab=riders&route=${route.id}`} className="fs-17 font-semibold text-ink hover:text-brand">
                  {route.name}
                </Link>
                <p className="fs-13.5 text-muted">
                  {vehicle ? `${vehicle.name}${vehicle.plate ? ` · ${vehicle.plate}` : ""}` : "No bus set"} · {formatNaira(route.termFeeKobo)} a term
                </p>
              </div>
              <span className="flex items-center gap-2">
                <Badge tone={full ? "warning" : "blue"}>
                  {riders}
                  {vehicle ? ` / ${vehicle.capacity}` : ""} riders
                </Badge>
                <RouteActions
                  slug={slug}
                  buses={buses}
                  route={{ id: route.id, name: route.name, vehicleId: route.vehicleId ?? "", fee: route.termFeeKobo ? String(route.termFeeKobo / 100) : "", stops: route.stops }}
                />
              </span>
            </div>
            <ol className="flex flex-col">
              {route.stops.map((s, i) => (
                <li key={s.name} className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-3 py-1.5">
                  <span className={cn("mx-auto size-2.5 rounded-full", i === 0 || i === route.stops.length - 1 ? "bg-brand" : "bg-line-strong")} />
                  <span className="fs-14.5 text-ink">{s.name}</span>
                  <span className="tabular fs-13.5 text-muted">
                    {s.pickup} · {s.dropoff}
                  </span>
                </li>
              ))}
            </ol>
            {vehicle?.driverName ? (
              <p className="flex items-center gap-2 border-t border-line pt-3 fs-13.5 text-body">
                <Icon name="phone" size={15} className="text-muted" />
                {vehicle.driverName}
                {vehicle.driverPhone ? <span className="text-muted">{vehicle.driverPhone}</span> : null}
              </p>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

async function Riders({ slug, access, sp, o }: { slug: string; access: Access; sp: SP; o: Overview }) {
  const db = getDb();
  const [rows, pupils] = await Promise.all([listRiders(db, access, { q: sp.q, routeId: sp.route }), transportStudents(db, access)]);
  const routes = o.routes.map((r) => ({ id: r.route.id, name: r.route.name, stops: r.route.stops }));
  return (
    <TableCard
      title="Students on buses"
      toolbar={
        <>
          <SearchInput placeholder="Student or stop…" />
          <FilterSelect label="Route" param="route" options={routes.map((r) => ({ value: r.id, label: r.name }))} />
          <ToolbarLink href={`/s/${slug}/transport/export${sp.route ? `?route=${sp.route}` : ""}`} icon="download">
            Export
          </ToolbarLink>
          <AddRiderButton slug={slug} pupils={pupils} routes={routes} />
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon="bus" title={sp.q || sp.route ? "Nobody matches" : "Nobody on a bus yet"}>
          {sp.q || sp.route ? "Try a different search or route." : routes.length ? "Add students to a route with Add student." : "Add a route first."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Student</Th>
              <Th>Route</Th>
              <Th>Stop</Th>
              <Th>Pick-up · drop-off</Th>
              <Th>Rides</Th>
              <Th className="w-12">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const stop = r.stops.find((s) => s.name === r.r.stop);
              return (
                <tr key={r.r.id} className="hover:bg-paper">
                  <Td>
                    <span className="block font-medium text-ink">{r.name}</span>
                    <span className="block fs-13 text-muted">{r.className ?? r.admissionNo}</span>
                  </Td>
                  <Td className="text-body">{r.route}</Td>
                  <Td className="text-body">{r.r.stop}</Td>
                  <Td className="tabular text-body">{stop ? `${stop.pickup} · ${stop.dropoff}` : "—"}</Td>
                  <Td className="text-body">{DIRECTION_LABEL[r.r.direction]}</Td>
                  <Td className="text-right">
                    <RiderActions slug={slug} routes={routes} rider={{ id: r.r.studentId, name: r.name, routeId: r.r.routeId, stop: r.r.stop, direction: r.r.direction }} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </TableCard>
  );
}

function Buses({ slug, o }: { slug: string; o: Overview }) {
  return (
    <TableCard title="Buses">
      {o.vehicles.length === 0 ? (
        <EmptyState icon="bus" title="No buses yet">
          Add each bus with its plate number, seats, driver and attendant.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Bus</Th>
              <Th className="text-right">Seats</Th>
              <Th>Route</Th>
              <Th>Driver</Th>
              <Th>Attendant</Th>
              <Th className="w-12">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {o.vehicles.map((v) => (
              <tr key={v.id} className="hover:bg-paper">
                <Td>
                  <span className="block font-medium text-ink">{v.name}</span>
                  {v.plate ? <span className="block font-mono fs-13 text-muted">{v.plate}</span> : null}
                </Td>
                <Td className="tabular text-right text-body">{v.capacity}</Td>
                <Td className="text-body">
                  {o.routes
                    .filter((r) => r.vehicle?.id === v.id)
                    .map((r) => r.route.name)
                    .join(", ") || "—"}
                </Td>
                <Td>
                  <span className="block text-ink">{v.driverName ?? "—"}</span>
                  {v.driverPhone ? <span className="block fs-13 text-muted">{v.driverPhone}</span> : null}
                </Td>
                <Td>
                  <span className="block text-ink">{v.attendantName ?? "—"}</span>
                  {v.attendantPhone ? <span className="block fs-13 text-muted">{v.attendantPhone}</span> : null}
                </Td>
                <Td className="text-right">
                  <VehicleActions
                    slug={slug}
                    bus={{
                      id: v.id,
                      name: v.name,
                      plate: v.plate ?? "",
                      capacity: String(v.capacity),
                      driverName: v.driverName ?? "",
                      driverPhone: v.driverPhone ?? "",
                      attendantName: v.attendantName ?? "",
                      attendantPhone: v.attendantPhone ?? "",
                    }}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </TableCard>
  );
}

async function Register({ slug, access, sp, o }: { slug: string; access: Access; sp: SP; o: Overview }) {
  if (!o.routes.length)
    return (
      <Card className="p-6">
        <EmptyState icon="bus" title="No routes yet">
          The bus register appears once there&apos;s a route.
        </EmptyState>
      </Card>
    );
  const routeId = o.routes.some((r) => r.route.id === sp.route) ? sp.route! : o.routes[0].route.id;
  const direction = sp.dir === "afternoon" ? "afternoon" : "morning";
  const t = await getTrip(getDb(), access, routeId, direction);
  const base = `/s/${slug}/transport?tab=register`;
  const chip = (active: boolean) => cn("inline-flex h-9 items-center rounded-full border px-3.5 fs-13.5 font-medium", active ? "border-brand bg-brand-wash text-brand-ink" : "border-line-strong bg-canvas text-body hover:bg-paper");
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {o.routes.map((r) => (
          <Link key={r.route.id} href={`${base}&route=${r.route.id}&dir=${direction}`} className={chip(r.route.id === routeId)}>
            {r.route.name}
          </Link>
        ))}
        <span className="mx-1 h-6 w-px bg-line" />
        {(["morning", "afternoon"] as const).map((d) => (
          <Link key={d} href={`${base}&route=${routeId}&dir=${d}`} className={chip(d === direction)}>
            {d === "morning" ? "Morning pick-up" : "Afternoon drop-off"}
          </Link>
        ))}
      </div>
      <TripRegister key={`${routeId}-${direction}`} slug={slug} routeId={routeId} direction={direction} riders={t.riders} boarded={t.trip?.boarded ?? []} savedAt={t.trip ? lagosClock(t.trip.recordedAt) : null} />
    </>
  );
}
