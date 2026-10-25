import "server-only";
import { APP_NAME } from "./config";
import { renderEmailHtml } from "./email-html";

/**
 * An email. `text` is the message as plain text (kept as the plain-text part for old clients);
 * `action` adds a button for its main link. `from` overrides the sender's display name
 * (e.g. a school's name), always on our own address.
 */
export type Email = { to: string; subject: string; text: string; action?: { label: string; url: string }; fromName?: string };

/** Sends through Resend when RESEND_API_KEY is set, otherwise logs (local development). */
export async function sendEmail(email: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[mail] to=${email.to} subject="${email.subject}"\n${email.text}`);
    return false;
  }
  const address = process.env.MAIL_FROM ?? `${APP_NAME} <no-reply@adalintech.com>`;
  const from = email.fromName ? address.replace(/^[^<]*</, `${email.fromName.replace(/[<>"]/g, "")} via ${APP_NAME} <`) : address;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        // The plain-text part always carries the button's link.
        text: email.action && !email.text.includes(email.action.url) ? `${email.text}\n\n${email.action.label}: ${email.action.url}` : email.text,
        html: renderEmailHtml(email),
      }),
    });
    if (!res.ok) console.error("[mail] Resend rejected the email", res.status, await res.text());
    return res.ok;
  } catch (error) {
    console.error("[mail] failed to send", error);
    return false;
  }
}
