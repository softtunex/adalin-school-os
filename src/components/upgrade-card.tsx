import { cheapestPlanWith, FEATURES, type FeatureKey } from "@/lib/plans/catalog";
import { ButtonLink } from "./ui/button";
import { Icon } from "./ui/icons";

export function UpgradeCard({ slug, feature, text, title }: { slug: string; feature?: FeatureKey; text?: string; title?: string }) {
  const plan = feature ? cheapestPlanWith(feature) : undefined;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-card border border-brand/30 bg-brand-wash p-5">
      <span className="grid size-12 place-items-center rounded-[14px] bg-brand text-white shadow-[0_3px_0_var(--brand-deep)]">
        <Icon name="upgrade" size={22} strokeWidth={2.6} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="fs-16 font-semibold text-ink">
          {title ?? (feature ? `${FEATURES[feature]} is on the ${plan?.name ?? "higher"} plan` : "Upgrade your plan")}
        </p>
        {text ? <p className="fs-14.5 text-body">{text}</p> : null}
      </div>
      <ButtonLink href={`/s/${slug}/settings?tab=plan`} size="sm">
        See plans
      </ButtonLink>
    </div>
  );
}
