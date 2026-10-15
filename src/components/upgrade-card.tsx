import { cheapestPlanWith, FEATURES, type FeatureKey } from "@/lib/plans/catalog";
import { ButtonLink } from "./ui/button";
import { Icon } from "./ui/icons";

export function UpgradeCard({ slug, feature, text }: { slug: string; feature: FeatureKey; text?: string }) {
  const plan = cheapestPlanWith(feature);
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-card border-2 border-brand bg-brand-wash p-5">
      <span className="grid size-12 place-items-center rounded-[14px] bg-brand text-white shadow-[0_3px_0_var(--brand-deep)]">
        <Icon name="upgrade" size={22} strokeWidth={2.6} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-extrabold text-ink">
          {FEATURES[feature]} is on the {plan?.name ?? "higher"} plan
        </p>
        {text ? <p className="text-[14.5px] text-body">{text}</p> : null}
      </div>
      <ButtonLink href={`/s/${slug}/settings#plan`} size="sm">
        See plans
      </ButtonLink>
    </div>
  );
}
