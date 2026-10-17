import { UpgradeCard } from "@/components/upgrade-card";
import { Badge, Card, Table, Td, Th } from "@/components/ui/display";
import { hasFeature } from "@/lib/plans/entitlements";
import type { Access } from "@/lib/services/access";
import { dnsFor } from "@/lib/services/domains";
import { DomainForm } from "./domain-client";

/** Web address: use School OS at the school's own domain, with its name and logo instead of ours. */
export function DomainTab({ slug, access }: { slug: string; access: Access }) {
  if (!hasFeature(access.plan, "custom_domain")) {
    return <UpgradeCard slug={slug} feature="custom_domain" text="Put School OS on your own address, like portal.yourschool.edu.ng, with your school's name and logo on the login page." />;
  }
  const domain = access.school.customDomain;
  const live = Boolean(access.school.domainVerifiedAt);
  return (
    <div className="flex max-w-[760px] flex-col gap-5">
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="fs-16 font-semibold text-ink">Your own web address</h2>
            <p className="mt-1 fs-14.5 text-body">Staff, parents and students can log in at your school&apos;s address. There, the login page and browser tabs show your school&apos;s name, logo and colour instead of School OS.</p>
          </div>
          {domain ? (
            live ? (
              <Badge tone="success" dot>
                Live
              </Badge>
            ) : (
              <Badge tone="warning" dot>
                Waiting for DNS
              </Badge>
            )
          ) : null}
        </div>
        <DomainForm slug={slug} current={domain} />
      </Card>
      {domain && !live ? (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="fs-16 font-semibold text-ink">Add this record</h2>
          <p className="fs-14.5 text-body">Where your domain is managed (your web host or domain registrar), add:</p>
          <Table minWidth="min-w-[480px]">
            <thead>
              <tr>
                <Th>Type</Th>
                <Th>Name</Th>
                <Th>Value</Th>
              </tr>
            </thead>
            <tbody>
              {dnsFor(domain).map((r) => (
                <tr key={r.type + r.name}>
                  <Td className="font-mono fs-13.5 text-ink">{r.type}</Td>
                  <Td className="font-mono fs-13.5 text-ink">{r.name}</Td>
                  <Td className="select-all font-mono fs-13.5 text-ink">{r.value}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="fs-13.5 text-muted">It can take from a few minutes to a few hours to work. Then press Check now. Your usual School OS address keeps working either way.</p>
        </Card>
      ) : null}
    </div>
  );
}
