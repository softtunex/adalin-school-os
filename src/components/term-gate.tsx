import { PageBody, Topbar } from "@/components/topbar";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/display";
import type { IconName } from "@/components/ui/icons";
import { getDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import type { Access } from "@/lib/services/access";
import { getCurrentTerm } from "@/lib/services/academics";

/**
 * Pages that work term by term (fees, lesson notes, analytics) can't show anything before a school
 * has a current term. This returns the page to show instead (how to start), or null once there is one.
 */
export async function termGate(access: Access, page: { title: string; icon: IconName; what: string }) {
  const current = await withTenant(getDb(), access.school.id, (tx) => getCurrentTerm(tx));
  if (current) return null;
  return (
    <>
      <Topbar title={page.title} context={access.school.name} />
      <PageBody>
        <Card>
          <EmptyState icon={page.icon} title="First, set up your classes and term" action={<ButtonLink href={`/s/${access.school.slug}/academics`}>Set up classes and terms</ButtonLink>}>
            {page.what} work term by term, so they start once your school has its classes and a current term. It takes about a minute.
          </EmptyState>
        </Card>
      </PageBody>
    </>
  );
}
