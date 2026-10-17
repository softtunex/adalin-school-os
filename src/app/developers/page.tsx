import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand";
import { API_SCOPES } from "@/lib/services/api-keys";
import { WEBHOOK_EVENTS } from "@/lib/services/webhooks";

export const metadata: Metadata = { title: "API documentation", description: "Read your school's data from School OS and get webhooks when things happen." };

const ENDPOINTS: { path: string; scope: string | null; about: string; params?: string }[] = [
  { path: "/api/v1/school", scope: null, about: "Your school's name, code and contact details." },
  { path: "/api/v1/students", scope: "students:read", about: "Students, 50 a page by admission number.", params: "status (active, graduated, withdrawn, suspended), class_id, updated_since (ISO time), page, per_page (up to 100)" },
  { path: "/api/v1/students/{id}", scope: "students:read", about: "One student, with their parents' names and contacts." },
  { path: "/api/v1/classes", scope: "academics:read", about: "Active classes with their level, arm and number of students." },
  { path: "/api/v1/terms", scope: "academics:read", about: "Terms, newest first, with the current one marked." },
  { path: "/api/v1/staff", scope: "staff:read", about: "Active staff with their roles and job titles." },
  { path: "/api/v1/invoices", scope: "fees:read", about: "Fee invoices, newest first. Amounts are in kobo.", params: "status (unpaid, partial, paid, void), student_id, term_id, page, per_page" },
  { path: "/api/v1/payments", scope: "fees:read", about: "Fee payments, newest first. Amounts are in kobo.", params: "from, to (YYYY-MM-DD), student_id, page, per_page" },
  { path: "/api/v1/attendance", scope: "attendance:read", about: "Every mark taken on one day.", params: "date (required, YYYY-MM-DD), class_id" },
];

function Code({ children }: { children: string }) {
  return (
    // Focusable, so the code can be scrolled sideways from the keyboard.
    <pre tabIndex={0} aria-label="Code example" className="overflow-x-auto rounded-chunk bg-ink p-4 font-mono fs-13 leading-relaxed text-canvas focus-visible:outline-2 focus-visible:outline-brand">
      <code>{children}</code>
    </pre>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-3">
      <h2 className="fs-22 font-bold tracking-[-0.01em] text-ink">{title}</h2>
      {children}
    </section>
  );
}

const VERIFY = `import crypto from "node:crypto";

// In your webhook handler, with the raw request body (before JSON parsing):
function fromSchoolOS(rawBody, signatureHeader, secret) {
  const { t, v1 } = Object.fromEntries(signatureHeader.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // older than 5 minutes
  const expected = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  return v1?.length === expected.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}`;

export default function DevelopersPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[880px] items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Logo />
          <span className="fs-14 font-semibold text-muted">API documentation</span>
        </div>
      </header>
      <main className="mx-auto flex max-w-[880px] flex-col gap-10 px-4 py-10 sm:px-8">
        <div className="flex flex-col gap-3">
          <h1 className="fs-34 font-black tracking-[-0.03em] text-ink">The School OS API</h1>
          <p className="max-w-[640px] fs-16 text-body">
            Read your school&apos;s students, classes, staff, fees and attendance from your own systems, and get told the moment a student joins or a payment comes in. Available on the Enterprise plan; the
            proprietor makes keys and webhooks under Settings, API &amp; webhooks.
          </p>
        </div>

        <Section id="auth" title="Signing in">
          <p className="fs-15 text-body">Send the key in the Authorization header. Keys only read; they only ever see the school that made them.</p>
          <Code>{`curl https://<your-school-os-address>/api/v1/students?status=active \\
  -H "Authorization: Bearer sosk_..."`}</Code>
          <p className="fs-15 text-body">Each key can read only what it was given:</p>
          <ul className="grid gap-1.5 fs-15 text-body sm:grid-cols-2">
            {Object.entries(API_SCOPES).map(([k, v]) => (
              <li key={k}>
                <code className="rounded bg-sunken px-1.5 py-0.5 fs-13.5 text-ink">{k}</code> {v}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="endpoints" title="Endpoints">
          <p className="fs-15 text-body">
            All are <code className="rounded bg-sunken px-1.5 py-0.5 fs-13.5">GET</code> and answer JSON as <code className="rounded bg-sunken px-1.5 py-0.5 fs-13.5">{"{ data }"}</code>; lists that page also return{" "}
            <code className="rounded bg-sunken px-1.5 py-0.5 fs-13.5">page</code>, <code className="rounded bg-sunken px-1.5 py-0.5 fs-13.5">per_page</code> and <code className="rounded bg-sunken px-1.5 py-0.5 fs-13.5">total</code>.
          </p>
          <div className="flex flex-col divide-y divide-line rounded-card border border-line">
            {ENDPOINTS.map((e) => (
              <div key={e.path} className="flex flex-col gap-1 p-4">
                <p className="flex flex-wrap items-center gap-2">
                  <code className="font-mono fs-14 font-semibold text-ink">{e.path}</code>
                  {e.scope ? <span className="rounded-full bg-blue-wash px-2 py-0.5 fs-12 font-semibold text-ink">{e.scope}</span> : null}
                </p>
                <p className="fs-14.5 text-body">{e.about}</p>
                {e.params ? <p className="fs-13.5 text-muted">Options: {e.params}</p> : null}
              </div>
            ))}
          </div>
        </Section>

        <Section id="errors" title="Errors and limits">
          <p className="fs-15 text-body">Errors come back with an HTTP status and a message you can show or log:</p>
          <Code>{`{ "error": { "code": "scope", "message": "This key can't read that. It needs the \\"fees:read\\" permission." } }`}</Code>
          <ul className="flex flex-col gap-1 fs-15 text-body">
            <li>401: no key, a wrong key, or a revoked one.</li>
            <li>403: the key lacks the permission, or the school&apos;s plan doesn&apos;t include the API.</li>
            <li>404: no record with that id in your school.</li>
            <li>429: more than 120 requests a minute with one key. Wait a minute and carry on.</li>
          </ul>
        </Section>

        <Section id="webhooks" title="Webhooks">
          <p className="fs-15 text-body">We POST JSON to your address when one of these happens:</p>
          <ul className="flex flex-col gap-1.5 fs-15 text-body">
            {Object.entries(WEBHOOK_EVENTS).map(([k, v]) => (
              <li key={k}>
                <code className="rounded bg-sunken px-1.5 py-0.5 fs-13.5 text-ink">{k}</code> {v}
              </li>
            ))}
          </ul>
          <Code>{`POST /your-address
X-SchoolOS-Event: payment.received
X-SchoolOS-Delivery: 5f0c…
X-SchoolOS-Signature: t=1792160000,v1=9a3c…

{
  "id": "5f0c…",
  "event": "payment.received",
  "created_at": "2026-10-17T09:30:00.000Z",
  "data": { "invoice_number": "INV-0042", "amount_kobo": 4500000, "receipt_no": "RCT-0107", "balance_kobo": 0, … }
}`}</Code>
          <p className="fs-15 text-body">
            Answer with any 2xx status within 10 seconds. Anything else is retried after 1, 5 and 30 minutes, then 2 and 6 hours. After 15 failures in a row the webhook is switched off until you switch it back on. The
            same delivery can arrive twice, so use its id to ignore repeats.
          </p>
          <p className="fs-15 text-body">Check every delivery is really from School OS with the signing secret you were shown when you added the webhook:</p>
          <Code>{VERIFY}</Code>
        </Section>
      </main>
    </div>
  );
}
