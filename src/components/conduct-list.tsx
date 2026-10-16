import { Badge, Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type Row = {
  r: { id: string; kind: "merit" | "incident"; category: string; severity: string | null; points: number; description: string; actionTaken: string | null; occurredOn: string; status: string };
  by: string | null;
};

function day(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** A student's merits and incidents, for the school's profile page and the parent app. */
export function ConductList({ conduct, name, action }: { conduct: { rows: Row[]; points: number; merits: number; incidents: number }; name: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { k: "Points this term", v: conduct.points > 0 ? `+${conduct.points}` : conduct.points, tone: conduct.points >= 0 ? "text-success-deep" : "text-danger" },
          { k: "Merits", v: conduct.merits, tone: "text-ink" },
          { k: "Incidents", v: conduct.incidents, tone: conduct.incidents ? "text-danger" : "text-ink" },
        ].map((x) => (
          <Card key={x.k} className="p-4">
            <p className="fs-13 text-muted">{x.k}</p>
            <p className={cn("tabular mt-1 fs-24 font-bold", x.tone)}>{x.v}</p>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="fs-16 font-semibold">Behaviour record</h2>
          {action}
        </div>
        {conduct.rows.length === 0 ? (
          <p className="mt-2 fs-14.5 text-muted">Nothing recorded for {name} yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {conduct.rows.map(({ r, by }) => (
              <li key={r.id} className="flex gap-3 py-3">
                <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full", r.kind === "merit" ? "bg-success-wash text-success" : "bg-danger-wash text-danger")}>
                  <Icon name={r.kind === "merit" ? "star" : "alert"} size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="fs-15 font-semibold text-ink">{r.category}</span>
                    {r.severity ? <Badge tone={r.severity === "serious" ? "danger" : r.severity === "moderate" ? "warning" : "neutral"}>{r.severity}</Badge> : null}
                    {r.status === "open" ? <Badge tone="danger">Open</Badge> : null}
                  </div>
                  {r.description ? <p className="fs-14 text-body">{r.description}</p> : null}
                  {r.actionTaken ? <p className="fs-13.5 text-muted">Action: {r.actionTaken}</p> : null}
                  <p className="fs-12.5 text-muted">
                    {day(r.occurredOn)}
                    {by ? ` · ${by}` : ""}
                  </p>
                </div>
                <span className={cn("tabular shrink-0 font-semibold", r.points >= 0 ? "text-success-deep" : "text-danger")}>{r.points > 0 ? `+${r.points}` : r.points}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
