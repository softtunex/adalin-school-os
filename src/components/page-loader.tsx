"use client";

import { useEffect, useState } from "react";

const TIPS = [
  "Sharpening pencils…",
  "Counting heads in the register…",
  "Adding up the scores…",
  "Finding the chalk…",
  "Ringing the school bell…",
  "Checking the timetable…",
];

/** Kola hovers on flapping wings, blinking, while a book, apple, star and pencil circle him. */
function KolaLoader() {
  return (
    <svg viewBox="0 0 300 300" className="size-56" aria-hidden>
      <ellipse className="kl-shadow" cx="150" cy="240" rx="52" ry="6" fill="currentColor" opacity="0.1" />

      <g className="kl-orbit">
        <g transform="translate(150 30) scale(1.3)">
          <g className="kl-counter">
            <rect x="-17" y="-13" width="34" height="26" rx="4" fill="#136DA4" />
            <rect x="-15" y="-13" width="30" height="22" rx="3" fill="#1A8FD6" />
            <path d="M-15 9h30v4h-30z" fill="#FFFFFF" />
            <path d="M-6 -6h14M-6 -1h10" stroke="#BFE4FA" strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>
        <g transform="translate(270 150) scale(1.3)">
          <g className="kl-counter">
            <circle cx="-6" cy="3" r="12" fill="#E5484D" />
            <circle cx="6" cy="3" r="12" fill="#E5484D" />
            <circle cx="-8" cy="-1" r="3.5" fill="#FFFFFF" opacity="0.55" />
            <path d="M0 -9c0-5 2-8 5-10" stroke="#7A4A1E" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M3 -12c6-6 13-4 14 0-6 3-11 3-14 0z" fill="#2BB24C" />
          </g>
        </g>
        <g transform="translate(150 272) scale(1.3)">
          <g className="kl-counter">
            <path d="M0 -17l5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2z" fill="#FFC83D" stroke="#E0A410" strokeWidth="2.5" strokeLinejoin="round" />
          </g>
        </g>
        <g transform="translate(30 150) scale(1.3)">
          <g className="kl-counter">
            <g transform="rotate(-40)">
              <rect x="-18" y="-5" width="28" height="10" rx="2" fill="#FFC83D" />
              <rect x="-22" y="-5" width="6" height="10" rx="2" fill="#F28BC1" />
              <path d="M10 -5l10 5-10 5z" fill="#F4D3A8" />
              <path d="M17 -1.5l3 1.5-3 1.5z" fill="#1D1D1F" />
            </g>
          </g>
        </g>
      </g>

      <g className="kl-hover">
        <g transform="translate(67.5 58) scale(0.75)">
          <path d="M86 206c-6 10-14 14-22 16M86 206c0 10 2 16 6 20M134 206c6 10 14 14 22 16M134 206c0 10-2 16-6 20" stroke="#E0A410" strokeWidth="7" strokeLinecap="round" fill="none" />
          <path className="kl-wing-l" d="M40 118c-22 4-36 28-34 54 14-4 30-20 38-38z" fill="#D24C00" />
          <path className="kl-wing-r" d="M180 118c22 4 36 28 34 54-14-4-30-20-38-38z" fill="#D24C00" />
          <path d="M110 44c50 0 80 40 80 92 0 48-34 76-80 76s-80-28-80-76c0-52 30-92 80-92z" fill="#FE6007" />
          <path d="M110 200c-40 0-70-24-74-62 10 30 40 48 74 48s64-18 74-48c-4 38-34 62-74 62z" fill="#D24C00" />
          <path d="M110 112c30 0 48 22 48 50 0 24-20 38-48 38s-48-14-48-38c0-28 18-50 48-50z" fill="#FFF4E8" />
          <g className="kl-eye">
            <circle cx="84" cy="96" r="22" fill="#FFFFFF" />
            <circle className="kl-pupil" cx="88" cy="99" r="11" fill="#1D1D1F" />
            <circle className="kl-pupil" cx="92" cy="94" r="4" fill="#FFFFFF" />
          </g>
          <g className="kl-eye">
            <circle cx="136" cy="96" r="22" fill="#FFFFFF" />
            <circle className="kl-pupil" cx="132" cy="99" r="11" fill="#1D1D1F" />
            <circle className="kl-pupil" cx="136" cy="94" r="4" fill="#FFFFFF" />
          </g>
          <path d="M96 112c4-10 24-10 28 0l-2 6H98z" fill="#E0A410" />
          <path d="M94 116c8-4 24-4 32 0 4 14-2 34-16 44-14-10-20-30-16-44z" fill="#FFC83D" />
          <path d="M100 134c6 3 14 3 20 0" stroke="#E0A410" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M58 52l52-22 52 22-52 22z" fill="#1D1D1F" />
          <path d="M80 62v14c0 8 14 14 30 14s30-6 30-14V62l-30 12z" fill="#2B2B2E" />
          <g className="kl-tassel">
            <path d="M162 52v26" stroke="#1A8FD6" strokeWidth="4" strokeLinecap="round" />
            <circle cx="162" cy="82" r="6" fill="#1A8FD6" />
          </g>
        </g>
      </g>
    </svg>
  );
}

/** Shown while a page streams in. Fades in after a beat so fast loads never flash it. */
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
    <div role="status" aria-live="polite" className={`animate-loader-in flex flex-col items-center justify-center gap-3 px-4 text-ink ${fullScreen ? "min-h-dvh" : "min-h-[60vh]"}`}>
      <KolaLoader />
      <p className="fs-14.5 font-medium text-muted">{TIPS[tip]}</p>
    </div>
  );
}
