import "server-only";
import { after } from "next/server";
import { getDb } from "./db/client";
import { drainOutbox } from "./services/outbox";

/** Sends queued SMS, WhatsApp and email once the response has gone back, so nobody waits on a provider. */
export function deliverSoon() {
  after(async () => {
    try {
      await drainOutbox(getDb());
    } catch (error) {
      console.error("[outbox] delivery failed", error);
    }
  });
}
