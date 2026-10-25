/*
 * The designed HTML version of every email: SchoolHub wordmark, the message, a button for the main
 * link, and a footer. Built from the plain text, with tables and inline styles because email apps
 * ignore most CSS. Images are left out: many apps block them, and the wordmark works as text.
 */
import { APP_NAME } from "./config";

const C = { ink: "#1d1b19", muted: "#66625d", line: "#e6e2dc", paper: "#f7f6f4", brand: "#fe6007", brandInk: "#b84300" };
const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Escapes a line and turns bare web addresses into links. */
function inline(line: string) {
  return esc(line).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => `<a href="${url}" style="color:${C.brandInk};word-break:break-all">${url}</a>`);
}

export function renderEmailHtml(email: { subject: string; text: string; action?: { label: string; url: string }; fromName?: string }) {
  const { action } = email;
  // The button stands in for its link, so a paragraph that is only that link is dropped.
  const paragraphs = email.text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !(action && p === action.url));
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;font:15px/1.6 ${FONT};color:${C.ink}">${p.split("\n").map(inline).join("<br>")}</p>`).join("");
  const button = action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="border-radius:12px;background:${C.brand}">
        <a href="${esc(action.url)}" style="display:inline-block;padding:13px 26px;font:700 15px ${FONT};color:#ffffff;text-decoration:none;border-radius:12px">${esc(action.label)}</a>
       </td></tr></table>
       <p style="margin:0 0 16px;font:13px/1.5 ${FONT};color:${C.muted}">Button not working? Copy this link into your browser:<br>${inline(action.url)}</p>`
    : "";
  const sender = email.fromName ? `Sent by ${esc(email.fromName)} through ${APP_NAME}.` : `Sent by ${APP_NAME}.`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(email.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.paper}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 4px 14px;font:900 22px/1 ${FONT};letter-spacing:-0.3px"><span style="color:${C.ink}">adalin</span> <span style="color:${C.brand}">schoolhub</span></td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${C.line};border-top:4px solid ${C.brand};border-radius:14px;padding:28px 28px 12px">
      ${body}${button}
    </td></tr>
    <tr><td style="padding:16px 8px 0;font:12px/1.5 ${FONT};color:${C.muted}">${sender} This is an automatic email, so replies aren't read.<br>Adalin Technologies · Lagos, Nigeria</td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
