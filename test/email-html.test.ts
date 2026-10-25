import { describe, expect, it } from "vitest";
import { renderEmailHtml } from "@/lib/email-html";

describe("designed emails", () => {
  const email = {
    subject: "You're invited",
    text: "Hi Tobi,\n\nYou've been invited to <Adalin Model School>.\n\nAccept here:\n\nhttps://schoolhub.adalintech.com/invite/abc123\n\nSee you there.",
    action: { label: "Accept invitation", url: "https://schoolhub.adalintech.com/invite/abc123" },
    fromName: "Adalin Model School",
  };
  const html = renderEmailHtml(email);

  it("has the wordmark, the message and a button for the main link", () => {
    expect(html).toContain(">adalin</span>");
    expect(html).toContain(">schoolhub</span>");
    expect(html).toContain("Hi Tobi,");
    expect(html).toContain('href="https://schoolhub.adalintech.com/invite/abc123"');
    expect(html).toContain(">Accept invitation</a>");
  });

  it("shows the link once as a fallback under the button, not again as its own paragraph", () => {
    expect(html.match(/>https:\/\/schoolhub\.adalintech\.com\/invite\/abc123</g)).toHaveLength(1);
    expect(html).toContain("Button not working?");
  });

  it("escapes what people typed and names the school that sent it", () => {
    expect(html).toContain("&lt;Adalin Model School&gt;");
    expect(html).not.toContain("<Adalin Model School>");
    expect(html).toContain("Sent by Adalin Model School through Adalin SchoolHub.");
  });

  it("turns other addresses in the text into links", () => {
    const plain = renderEmailHtml({ subject: "Fees", text: "Pay here: https://schoolhub.adalintech.com/pay/xyz." });
    expect(plain).toContain('<a href="https://schoolhub.adalintech.com/pay/xyz"');
    expect(plain).not.toContain("Button not working?");
  });
});
