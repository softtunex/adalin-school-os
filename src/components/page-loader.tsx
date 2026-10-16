"use client";

import { useEffect, useState } from "react";
import { Kola } from "@/components/illustrations/art";

const TIPS = [
  "Sharpening pencils…",
  "Counting heads in the register…",
  "Adding up the scores…",
  "Finding the chalk…",
  "Ringing the school bell…",
  "Checking the timetable…",
];

/** Kola hops while a page streams in. Fades in after a beat so fast loads never flash it. */
export function PageLoader({ fullScreen = false }: { fullScreen?: boolean }) {
  const [tip, setTip] = useState(0);

  useEffect(() => {
    const start = setTimeout(() => setTip(Math.floor(Math.random() * TIPS.length)), 0);
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 2400);
    return () => {
      clearTimeout(start);
      clearInterval(id);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`animate-loader-in flex flex-col items-center justify-center gap-5 px-4 ${fullScreen ? "min-h-dvh" : "min-h-[60vh]"}`}
    >
      <div className="relative h-28 w-24">
        <Kola className="animate-hop absolute inset-x-0 top-0 h-24 w-24" />
        <span aria-hidden className="animate-hop-shadow absolute bottom-0 left-1/2 h-2.5 w-14 -translate-x-1/2 rounded-full bg-ink/10" />
      </div>
      <div className="flex items-center gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="animate-dot size-2.5 rounded-full bg-brand" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
      <p className="fs-14 font-medium text-muted">{TIPS[tip]}</p>
    </div>
  );
}
