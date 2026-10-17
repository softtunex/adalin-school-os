import { Badge, Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import type { getChildBus } from "@/lib/services/transport";
import { DIRECTION_LABEL } from "@/lib/services/transport";
import { lagosClock } from "@/lib/services/hr";

type Bus = NonNullable<Awaited<ReturnType<typeof getChildBus>>>;

function day(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** A parent's view of their child's school bus: where and when, who drives, and recent trips. */
export function BusPanel({ bus, name }: { bus: Bus; name: string }) {
  const v = bus.vehicle;
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-5">
        <div>
          <p className="fs-13 font-semibold uppercase tracking-[0.05em] text-muted">{bus.route.name}</p>
          <p className="mt-1 fs-18 font-bold text-ink">{bus.r.stop}</p>
          <p className="fs-14 text-muted">{DIRECTION_LABEL[bus.r.direction]}</p>
        </div>
        {bus.stop ? (
          <div className="grid grid-cols-2 gap-3">
            {bus.r.direction !== "afternoon" ? (
              <div className="rounded-chunk bg-paper p-3">
                <p className="fs-13 text-muted">Pick-up</p>
                <p className="tabular fs-20 font-bold text-ink">{bus.stop.pickup}</p>
              </div>
            ) : null}
            {bus.r.direction !== "morning" ? (
              <div className="rounded-chunk bg-paper p-3">
                <p className="fs-13 text-muted">Drop-off</p>
                <p className="tabular fs-20 font-bold text-ink">{bus.stop.dropoff}</p>
              </div>
            ) : null}
          </div>
        ) : null}
        {v ? (
          <dl className="grid gap-2 border-t border-line pt-3 fs-14.5">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Bus</dt>
              <dd className="text-ink">
                {v.name}
                {v.plate ? <span className="ml-1.5 font-mono text-muted">{v.plate}</span> : null}
              </dd>
            </div>
            {v.driverName ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Driver</dt>
                <dd className="text-right text-ink">
                  {v.driverName}
                  {v.driverPhone ? (
                    <a href={`tel:${v.driverPhone.replace(/\s/g, "")}`} className="ml-2 inline-flex items-center gap-1 font-semibold text-brand-ink">
                      <Icon name="phone" size={14} /> {v.driverPhone}
                    </a>
                  ) : null}
                </dd>
              </div>
            ) : null}
            {v.attendantName ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Attendant</dt>
                <dd className="text-right text-ink">
                  {v.attendantName}
                  {v.attendantPhone ? <span className="ml-2 text-muted">{v.attendantPhone}</span> : null}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </Card>
      <Card className="p-5">
        <h2 className="fs-16 font-semibold">Recent trips</h2>
        {bus.trips.length === 0 ? (
          <p className="mt-2 fs-14.5 text-muted">The bus register for {name}&apos;s route hasn&apos;t been taken yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {bus.trips.map((t) => (
              <li key={`${t.date}-${t.direction}`} className="flex items-center justify-between gap-3 py-2.5">
                <span className="fs-14.5 text-ink">
                  {day(t.date)} · {t.direction === "morning" ? "to school" : "home"}
                </span>
                {t.on ? <Badge tone="success">On the bus, {lagosClock(t.at)}</Badge> : <Badge tone="neutral">Not on the bus</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
