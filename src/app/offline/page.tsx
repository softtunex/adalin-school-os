import type { Metadata } from "next";
import { Logo } from "@/components/brand";

export const metadata: Metadata = { title: "You're offline" };

/** Shown by the service worker when a page isn't saved for offline use. */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-5 py-8">
      <Logo href="/schools" />
      <div className="mt-16 flex flex-col gap-3">
        <h1 className="fs-28 font-black tracking-[-0.02em] text-ink">You&apos;re offline</h1>
        <p className="fs-15.5 text-body">This page needs a connection. Registers and score sheets you&apos;ve opened before still work offline, and anything you change is sent as soon as you&apos;re back online.</p>
        <a href="" className="mt-2 self-start fs-15 font-semibold text-blue hover:underline">
          Try again
        </a>
      </div>
    </div>
  );
}
