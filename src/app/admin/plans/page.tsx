import { count } from "drizzle-orm";
import { PageBody, Topbar } from "@/components/topbar";
import { Badge, Card } from "@/components/ui/display";
import { getDb } from "@/lib/db/client";
import { plans, schools } from "@/lib/db/schema";
import { formatNaira } from "@/lib/money";
import { FEATURES, type FeatureKey } from "@/lib/plans/catalog";
import { PlanEditor } from "../admin-client";

export const metadata = { title: "Plans" };

export default async function AdminPlans() {
  const db = getDb();
  const [all, counts] = await Promise.all([db.select().from(plans).orderBy(plans.sort), db.select({ key: schools.planKey, n: count() }).from(schools).groupBy(schools.planKey)]);
  const features = Object.entries(FEATURES).map(([key, label]) => ({ key, label }));
  return (
    <>
      <Topbar title="Plans" context="Prices, features and limits" />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {all.map((p) => {
            const schoolsOn = counts.find((c) => c.key === p.key)?.n ?? 0;
            const limits = [p.limits.students ? `${p.limits.students} students` : "Any number of students", p.limits.staff ? `${p.limits.staff} staff` : "any number of staff", `activity log ${p.limits.audit_days ? `${p.limits.audit_days} days` : "off"}`];
            return (
              <Card key={p.key} className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="fs-18 font-semibold text-ink">{p.name}</h2>
                    <p className="tabular fs-15 text-body">{p.pricePerStudentKobo === null ? "Custom price" : p.pricePerStudentKobo === 0 ? "Free" : `${formatNaira(p.pricePerStudentKobo)} per student a term`}</p>
                  </div>
                  <PlanEditor plan={p} features={features} />
                </div>
                <p className="fs-13.5 text-muted">{limits.join(" · ")}</p>
                <Badge tone="blue" className="self-start">
                  {schoolsOn} {schoolsOn === 1 ? "school" : "schools"}
                </Badge>
                <ul className="flex flex-wrap gap-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="rounded-md bg-sunken px-2 py-0.5 fs-12.5 text-body">
                      {FEATURES[f as FeatureKey] ?? f}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </PageBody>
    </>
  );
}
