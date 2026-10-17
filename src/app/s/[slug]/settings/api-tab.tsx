import Link from "next/link";
import { UpgradeCard } from "@/components/upgrade-card";
import { Badge, Card, EmptyState, Table, TableCard, Td, Th } from "@/components/ui/display";
import { getDb } from "@/lib/db/client";
import { hasFeature } from "@/lib/plans/entitlements";
import type { Access } from "@/lib/services/access";
import { API_SCOPES, listApiKeys } from "@/lib/services/api-keys";
import { listWebhooks, WEBHOOK_EVENTS } from "@/lib/services/webhooks";
import { NewApiKey, NewWebhook, RevokeKey, WebhookActions } from "./api-client";

const when = (d: Date | null) => (d ? d.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }) : "Never");

/** API & webhooks: connect the school's other systems (website, accounting, SIS) to School OS. */
export async function ApiTab({ slug, access }: { slug: string; access: Access }) {
  if (!hasFeature(access.plan, "api_access")) {
    return <UpgradeCard slug={slug} feature="api_access" text="Connect your website, accounting software or other systems to School OS with API keys and webhooks." />;
  }
  const db = getDb();
  const [keys, hooks] = await Promise.all([listApiKeys(db, access), listWebhooks(db, access)]);
  const scopes = Object.entries(API_SCOPES).map(([key, label]) => ({ key, label }));
  const events = Object.entries(WEBHOOK_EVENTS).map(([key, label]) => ({ key, label }));
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="max-w-[640px] fs-14.5 text-body">
          Let your other systems read from School OS with an API key, and hear about new students, payments and results as they happen with webhooks. Keys are read-only and only see your school.
        </p>
        <Link href="/developers" className="fs-14.5 font-semibold text-brand hover:underline" target="_blank">
          API documentation
        </Link>
      </Card>

      <TableCard title="API keys" toolbar={<NewApiKey slug={slug} scopes={scopes} />}>
        {keys.length === 0 ? (
          <EmptyState icon="key" title="No keys yet">
            Make one for each system that reads from School OS, so you can revoke one without breaking the others.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Key</Th>
                <Th>Can read</Th>
                <Th>Last used</Th>
                <Th className="w-28">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className={k.revokedAt ? "opacity-60" : undefined}>
                  <Td className="font-medium text-ink">{k.name}</Td>
                  <Td className="font-mono fs-13.5 text-body">{k.prefix}…</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {k.scopes.map((s) => (
                        <Badge key={s}>{API_SCOPES[s as keyof typeof API_SCOPES] ?? s}</Badge>
                      ))}
                    </span>
                  </Td>
                  <Td className="text-body">{k.revokedAt ? <Badge tone="neutral">Revoked</Badge> : when(k.lastUsedAt)}</Td>
                  <Td className="text-right">{k.revokedAt ? null : <RevokeKey slug={slug} keyId={k.id} name={k.name} />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableCard>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="fs-16 font-semibold">Webhooks</h2>
          <p className="mt-1 fs-14 text-muted">We POST to your address when something happens, and retry for about 9 hours if it&apos;s down.</p>
        </div>
        <NewWebhook slug={slug} events={events} />
      </div>
      {hooks.length === 0 ? (
        <Card>
          <EmptyState icon="send" title="No webhooks yet">
            Add one to have payments and new students pushed to your other systems.
          </EmptyState>
        </Card>
      ) : (
        hooks.map((h) => (
          <Card key={h.id} className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-all font-mono fs-14 text-ink">{h.url}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 fs-13 text-muted">
                  {h.active ? (
                    <Badge tone="success" dot>
                      On
                    </Badge>
                  ) : (
                    <Badge tone="danger" dot>
                      {h.failures >= 15 ? "Switched off after repeated failures" : "Off"}
                    </Badge>
                  )}
                  {h.events.map((e) => (
                    <Badge key={e}>{e}</Badge>
                  ))}
                  <span>Secret {h.secretHint}</span>
                </p>
              </div>
              <WebhookActions slug={slug} webhookId={h.id} active={h.active} />
            </div>
            {h.deliveries.length ? (
              <Table minWidth="min-w-[560px]">
                <thead>
                  <tr>
                    <Th>Event</Th>
                    <Th>When</Th>
                    <Th>Result</Th>
                  </tr>
                </thead>
                <tbody>
                  {h.deliveries.map((d) => (
                    <tr key={d.id}>
                      <Td className="font-mono fs-13.5 text-ink">{d.event}</Td>
                      <Td className="text-body">{when(d.createdAt)}</Td>
                      <Td>
                        {d.status === "sent" ? (
                          <Badge tone="success">Delivered ({d.responseStatus})</Badge>
                        ) : d.status === "failed" ? (
                          <Badge tone="danger">Failed: {d.error}</Badge>
                        ) : d.attempts ? (
                          <Badge tone="warning">
                            Retrying ({d.attempts} {d.attempts === 1 ? "try" : "tries"}): {d.error}
                          </Badge>
                        ) : (
                          <Badge tone="blue">Waiting to send</Badge>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="fs-13.5 text-muted">Nothing sent yet. Use &ldquo;Send a test&rdquo; to check your receiver.</p>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
