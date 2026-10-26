import { UpgradeCard } from "@/components/upgrade-card";
import { Alert } from "@/components/ui/display";
import { aiProvider } from "@/lib/ai/provider";
import { getDb } from "@/lib/db/client";
import { hasFeature } from "@/lib/plans/entitlements";
import { can, type Access } from "@/lib/services/access";
import { aiSettings, aiUsageSummary } from "@/lib/services/ai";
import { AiSettingsForm } from "./ai-form";

/** The school's switch for AI helpers, and how much of today's allowance is used. */
export async function AiTab({ slug, access }: { slug: string; access: Access }) {
  if (!hasFeature(access.plan, "ai")) {
    return <UpgradeCard slug={slug} feature="ai" text="Let AI draft exam questions, read questions from a photo, suggest report card comments, and answer staff questions as Kola." />;
  }
  const usage = await aiUsageSummary(getDb(), access);
  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      {!aiProvider() ? <Alert tone="warning">AI isn&apos;t set up on this server yet. Adalin is switching it on; you can choose your settings now.</Alert> : null}
      <AiSettingsForm slug={slug} settings={aiSettings(access.school.aiSettings)} editable={can(access, "school:update")} used={usage.used} limit={usage.limit} perPerson={usage.perPerson} top={usage.top} />
    </div>
  );
}
