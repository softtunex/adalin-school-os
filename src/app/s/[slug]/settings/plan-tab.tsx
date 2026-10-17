import { Alert, Badge, Card, EmptyState, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { SUPPORT_WHATSAPP } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { formatNaira } from "@/lib/money";
import { FEATURES, LIMITS, type FeatureKey, type LimitKey } from "@/lib/plans/catalog";
import type { Access } from "@/lib/services/access";
import { lagosToday } from "@/lib/services/attendance";
import { billingOverview, charge, termFraction, TRIAL_DAYS, TRIAL_PLANS } from "@/lib/services/billing";
import { supportStatus } from "@/lib/services/platform";
import { PayBillButton, PlanButton } from "./billing-client";
import { SupportAccess } from "./support-access";

function day(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Plan & billing: what you're on, what you owe, and how to change it. */
export async function PlanTab({ slug, access, canBill, paid, failed }: { slug: string; access: Access; canBill: boolean; paid?: string; failed?: string }) {
  if (!canBill) return <ReadOnlyPlans access={access} />;
  const [b, grant] = await Promise.all([billingOverview(getDb(), access), supportStatus(getDb(), access)]);
  const today = lagosToday();
  const fraction = b.term ? termFraction({ startsOn: b.term.startsOn, endsOn: b.term.endsOn }, today) : 1;
  const currentPrice = b.plan.pricePerStudentKobo ?? 0;
  const basePlan = b.trial ? (b.plans.find((p) => p.key === b.trial!.returnTo) ?? b.plan) : b.plan;
  const basePrice = basePlan.pricePerStudentKobo ?? 0;
  const termBilled = b.bills.some((x) => x.kind === "term" && x.status !== "void" && b.term && x.period === b.term.name);
  return (
    <div className="flex flex-col gap-5">
      {paid ? <Alert tone="success">Thank you. {paid === "1" ? "Your payment went through." : `Bill ${paid} is paid.`}</Alert> : null}
      {failed ? <Alert tone="danger">The payment didn&apos;t go through. You haven&apos;t been charged.</Alert> : null}
      {b.readOnly ? <Alert tone="danger">Your school is read-only until the overdue bill below is paid. Everyone can still view everything, and parents can still pay fees.</Alert> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex flex-col gap-1 p-5">
          <span className="fs-13.5 text-muted">Your plan</span>
          <span className="flex items-center gap-2 fs-22 font-bold text-ink">
            {b.plan.name}
            {b.trial ? <Badge tone="blue">Free trial</Badge> : null}
          </span>
          <span className="fs-13.5 text-body">
            {b.trial
              ? `${b.trial.daysLeft} day${b.trial.daysLeft === 1 ? "" : "s"} left. Then back to ${b.plans.find((p) => p.key === b.trial!.returnTo)?.name ?? "Free"} unless you choose a plan.`
              : currentPrice
                ? `${formatNaira(currentPrice)} per student, per term`
                : "No charge"}
          </span>
          {b.pending ? <span className="mt-1 fs-13.5 font-medium text-warning-deep">Moving to {b.pending.name} next term.</span> : null}
        </Card>
        <Card className="flex flex-col gap-1 p-5">
          <span className="fs-13.5 text-muted">Students on roll</span>
          <span className="tabular fs-22 font-bold text-ink">{b.onRoll}</span>
          <span className="fs-13.5 text-body">{b.term ? `${b.term.name}${currentPrice && !b.trial ? `: about ${formatNaira(b.estimate)} a term` : ""}` : "Set the current term to be billed."}</span>
        </Card>
        <Card className={cn("flex flex-col gap-1 p-5", b.overdue > 0 && "border-danger")}>
          <span className="fs-13.5 text-muted">Owed</span>
          <span className={cn("tabular fs-22 font-bold", b.owed ? "text-ink" : "text-success-deep")}>{b.owed ? formatNaira(b.owed) : "Nothing"}</span>
          <span className="fs-13.5 text-body">{b.overdue ? `${b.overdue} bill${b.overdue === 1 ? "" : "s"} overdue` : b.owed ? "Due within 14 days of each bill" : "All bills paid"}</span>
        </Card>
      </div>

      <TableCard title="Bills">
        {b.bills.length === 0 ? (
          <EmptyState icon="receipt" title="No bills yet">
            {currentPrice && !b.trial ? "Your bill for the term appears here once the term starts." : "Free plans and trials aren't billed. Bills appear here when you're on a paid plan."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Bill</Th>
                <Th>For</Th>
                <Th className="text-right">Amount</Th>
                <Th>Due</Th>
                <Th>Status</Th>
                <Th className="w-44">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {b.bills.map((x) => {
                const late = x.status === "open" && x.dueOn < today;
                return (
                  <tr key={x.id} className="hover:bg-paper">
                    <Td className="whitespace-nowrap font-mono fs-13.5 text-ink">{x.number}</Td>
                    <Td>
                      <span className="block text-ink">{x.period}</span>
                      {x.lines.map((l, i) => (
                        <span key={i} className="block fs-13 text-muted">
                          {l.description}
                        </span>
                      ))}
                    </Td>
                    <Td className="tabular text-right font-semibold text-ink">{formatNaira(x.totalKobo)}</Td>
                    <Td className={cn("whitespace-nowrap", late ? "font-semibold text-danger" : "text-body")}>{day(x.dueOn)}</Td>
                    <Td>
                      {x.status === "paid" ? (
                        <Badge tone="success">Paid</Badge>
                      ) : x.status === "void" ? (
                        <Badge tone="neutral">Cancelled</Badge>
                      ) : late ? (
                        <Badge tone="danger" dot>
                          Overdue
                        </Badge>
                      ) : (
                        <Badge tone="warning" dot>
                          To pay
                        </Badge>
                      )}
                    </Td>
                    <Td className="text-right">{x.status === "open" ? <PayBillButton slug={slug} billId={x.id} amount={formatNaira(x.totalKobo)} /> : null}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </TableCard>

      <SupportAccess slug={slug} openUntil={grant ? grant.expiresAt.toLocaleString("en-NG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }) : null} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="fs-16 font-semibold">Plans</h2>
          <p className="mt-1 fs-14 text-muted">Priced per student, per term. Upgrades start straight away; a cheaper plan starts next term.</p>
        </div>
        <p className="fs-14 text-muted">
          Questions? WhatsApp us: <span className="select-all font-semibold text-ink">{SUPPORT_WHATSAPP}</span>
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {b.plans.map((p, i) => {
          const current = p.key === b.plan.key;
          const previous = b.plans[i - 1];
          const added = previous ? p.features.filter((f) => !previous.features.includes(f)) : p.features;
          const price = p.pricePerStudentKobo ?? 0;
          const enterprise = p.pricePerStudentKobo === null;
          const tooMany = !current && typeof p.limits.students === "number" && b.onRoll > p.limits.students;
          let action: { mode: "trial" | "upgrade" | "downgrade" | "switch"; quote: string } | null = null;
          if (!current && !enterprise) {
            if (b.trialAvailable && TRIAL_PLANS.includes(p.key) && price > currentPrice) {
              action = { mode: "trial", quote: `Use everything in ${p.name} free for ${TRIAL_DAYS} days. No card needed. When the trial ends you go back to ${b.plan.name} unless you choose a plan.` };
            } else if (b.trial || price > basePrice) {
              const now = termBilled && !b.trial ? charge(price - basePrice, b.onRoll, fraction) : charge(price, b.onRoll, fraction);
              action = {
                mode: b.trial ? "switch" : "upgrade",
                quote: `${p.name} starts straight away. ${b.term && price ? `For the rest of ${b.term.name} (${Math.round(fraction * 100)}% of the term left) that's ${formatNaira(now)}, then ${formatNaira(charge(price, b.onRoll))} a term for ${b.onRoll} students.` : price ? `${formatNaira(price)} per student per term.` : "There's no charge."}`,
              };
            } else {
              action = { mode: "downgrade", quote: `You'll keep ${b.plan.name} until this term ends, then move to ${p.name}${price ? ` at ${formatNaira(price)} per student per term` : ", which is free"}. Features not in ${p.name} switch off then; nothing is deleted.` };
            }
          }
          return (
            <Card key={p.key} className={cn("flex flex-col gap-3 p-5", current && "border-brand shadow-[0_4px_0_var(--brand)]")}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="fs-17 font-semibold">{p.name}</h3>
                {current ? <Badge tone="brand">{b.trial ? "On trial" : "Current"}</Badge> : b.pending?.key === p.key ? <Badge tone="warning">Next term</Badge> : null}
              </div>
              <p className="tabular fs-24 font-semibold tracking-[-0.02em] text-ink">
                {enterprise ? "Custom" : price === 0 ? "Free" : formatNaira(price)}
                {price ? <span className="block fs-13 font-normal tracking-normal text-muted">per student / term</span> : null}
              </p>
              {tooMany ? (
                <span className="fs-13.5 text-muted">
                  Allows {p.limits.students} students; you have {b.onRoll} on roll.
                </span>
              ) : action ? (
                <PlanButton slug={slug} planKey={p.key} planName={p.name} mode={action.mode} quote={action.quote} />
              ) : enterprise && !current ? (
                <span className="fs-13.5 text-muted">Talk to us on WhatsApp.</span>
              ) : null}
              <ul className="flex flex-col gap-1.5 border-t border-line pt-3 fs-13.5">
                {Object.entries(p.limits).map(([k, n]) =>
                  k === "audit_days" ? null : (
                    <li key={k} className="font-medium text-ink">
                      Up to {n} {LIMITS[k as LimitKey].toLowerCase()}
                    </li>
                  ),
                )}
                {previous ? <li className="text-muted">Everything in {previous.name}, plus:</li> : null}
                {added.map((f) => (
                  <li key={f} className="flex gap-1.5 text-body">
                    <Icon name="check" size={15} strokeWidth={2.6} className="mt-0.5 shrink-0 text-success" />
                    {FEATURES[f as FeatureKey] ?? f}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Staff without billing rights see the plans only. */
function ReadOnlyPlans({ access }: { access: Access }) {
  return (
    <Card className="p-5">
      <p className="fs-15 text-body">
        Your school is on the <strong className="text-ink">{access.plan.name}</strong> plan. The proprietor manages plans and bills.
      </p>
    </Card>
  );
}
