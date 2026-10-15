import "server-only";
import { APP_NAME } from "./config";

type Email = { to: string; subject: string; text: string };

/** Sends through Resend when RESEND_API_KEY is set, otherwise logs (local development). */
export async function sendEmail(email: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[mail] to=${email.to} subject="${email.subject}"\n${email.text}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM ?? `${APP_NAME} <no-reply@adalintech.com>`,
        to: [email.to],
        subject: email.subject,
        text: email.text,
      }),
    });
    if (!res.ok) console.error("[mail] Resend rejected the email", res.status, await res.text());
    return res.ok;
  } catch (error) {
    console.error("[mail] failed to send", error);
    return false;
  }
}
