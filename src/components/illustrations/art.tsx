/*
 * Placeholder artwork in the Duolingo-like flat style, used until the generated
 * illustrations from docs/illustration-briefs.md are dropped into public/illustrations.
 */
import type { SVGProps } from "react";

const C = {
  orange: "#FE6007",
  orangeDeep: "#D24C00",
  orangeLight: "#FF9A5C",
  cream: "#FFF4E8",
  yellow: "#FFC83D",
  yellowDeep: "#E0A410",
  blue: "#1A8FD6",
  blueDeep: "#136DA4",
  blueLight: "#BFE4FA",
  green: "#2BB24C",
  greenDeep: "#1E8A39",
  pink: "#F28BC1",
  purple: "#7C5CDB",
  ink: "#1D1D1F",
  white: "#FFFFFF",
  paper: "#F4F1EC",
  line: "#E4DED6",
};

/** Kola the hornbill, the School OS mascot (draft). */
export function Kola({ wave = false, ...props }: SVGProps<SVGSVGElement> & { wave?: boolean }) {
  return (
    <svg viewBox="0 0 220 240" fill="none" aria-hidden {...props}>
      <ellipse cx="110" cy="226" rx="62" ry="9" fill="#000" opacity="0.08" />
      {/* feet */}
      <path d="M86 206c-6 10-14 14-22 16M86 206c0 10 2 16 6 20M134 206c6 10 14 14 22 16M134 206c0 10-2 16-6 20" stroke={C.yellowDeep} strokeWidth="7" strokeLinecap="round" />
      {/* body */}
      <path d="M110 44c50 0 80 40 80 92 0 48-34 76-80 76s-80-28-80-76c0-52 30-92 80-92z" fill={C.orange} />
      <path d="M110 200c-40 0-70-24-74-62 10 30 40 48 74 48s64-18 74-48c-4 38-34 62-74 62z" fill={C.orangeDeep} />
      {/* belly */}
      <path d="M110 112c30 0 48 22 48 50 0 24-20 38-48 38s-48-14-48-38c0-28 18-50 48-50z" fill={C.cream} />
      {/* wings */}
      <path d="M36 124c-14 6-22 26-18 46 10-4 22-16 26-30z" fill={C.orangeDeep} />
      {wave ? (
        <g className="origin-[184px_128px] animate-[wave_1.8s_ease-in-out_infinite]">
          <path d="M184 128c18-12 26-36 22-56-12 4-24 20-28 38z" fill={C.orangeDeep} />
        </g>
      ) : (
        <path d="M184 124c14 6 22 26 18 46-10-4-22-16-26-30z" fill={C.orangeDeep} />
      )}
      {/* eyes */}
      <circle cx="84" cy="96" r="22" fill={C.white} />
      <circle cx="136" cy="96" r="22" fill={C.white} />
      <circle cx="88" cy="99" r="11" fill={C.ink} />
      <circle cx="132" cy="99" r="11" fill={C.ink} />
      <circle cx="92" cy="94" r="4" fill={C.white} />
      <circle cx="136" cy="94" r="4" fill={C.white} />
      {/* casque and beak */}
      <path d="M96 112c4-10 24-10 28 0l-2 6H98z" fill={C.yellowDeep} />
      <path d="M94 116c8-4 24-4 32 0 4 14-2 34-16 44-14-10-20-30-16-44z" fill={C.yellow} />
      <path d="M100 134c6 3 14 3 20 0" stroke={C.yellowDeep} strokeWidth="4" strokeLinecap="round" />
      {/* graduation cap */}
      <path d="M58 52l52-22 52 22-52 22z" fill={C.ink} />
      <path d="M80 62v14c0 8 14 14 30 14s30-6 30-14V62l-30 12z" fill="#2B2B2E" />
      <path d="M162 52v26" stroke={C.blue} strokeWidth="4" strokeLinecap="round" />
      <circle cx="162" cy="82" r="6" fill={C.blue} />
    </svg>
  );
}

/** A chunky 3D card: face plus a darker slab underneath, like Duolingo's tilted devices. */
function Slab({ x, y, w, h, r = 16, face, edge, depth = 10, rotate = 0, children }: { x: number; y: number; w: number; h: number; r?: number; face: string; edge: string; depth?: number; rotate?: number; children?: React.ReactNode }) {
  return (
    <g transform={`rotate(${rotate} ${x + w / 2} ${y + h / 2})`}>
      <rect x={x} y={y + depth} width={w} height={h} rx={r} fill={edge} />
      <rect x={x} y={y} width={w} height={h} rx={r} fill={face} />
      {children}
    </g>
  );
}

function Check({ cx, cy, r = 16, fill = C.green }: { cx: number; cy: number; r?: number; fill?: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy + 3} r={r} fill={C.greenDeep} />
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      <path d={`M${cx - r * 0.42} ${cy}l${r * 0.3} ${r * 0.3} ${r * 0.55}-${r * 0.6}`} stroke={C.white} strokeWidth={r * 0.26} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function Coin({ cx, cy, r = 18 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy + 4} rx={r} ry={r} fill={C.yellowDeep} />
      <circle cx={cx} cy={cy} r={r} fill={C.yellow} />
      <circle cx={cx} cy={cy} r={r * 0.7} fill="none" stroke={C.yellowDeep} strokeWidth="2.5" />
      <text x={cx} y={cy + r * 0.32} textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="800" fontSize={r * 0.95} fill={C.yellowDeep}>
        ₦
      </text>
    </g>
  );
}

function Bars({ x, y, widths, color = C.line, gap = 16, h = 8 }: { x: number; y: number; widths: number[]; color?: string; gap?: number; h?: number }) {
  return (
    <g>
      {widths.map((w, i) => (
        <rect key={i} x={x} y={y + i * gap} width={w} height={h} rx={h / 2} fill={color} />
      ))}
    </g>
  );
}

export function HeroScene(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 560 440" fill="none" aria-hidden {...props}>
      <circle cx="280" cy="220" r="190" fill="#FFF1E8" />
      {/* tablet with report */}
      <Slab x={150} y={110} w={250} h={190} face={C.white} edge={C.line} rotate={-8} depth={14} r={22}>
        <rect x={168} y={128} width={214} height={30} rx={10} fill={C.orange} />
        <Bars x={176} y={140} widths={[90]} color="#FFD2B4" />
        <Bars x={176} y={176} widths={[120, 150, 100, 140]} gap={20} />
        <rect x={322} y={172} width={44} height={22} rx={8} fill={C.green} />
        <rect x={322} y={202} width={44} height={22} rx={8} fill={C.blue} />
        <rect x={322} y={232} width={44} height={22} rx={8} fill={C.green} />
      </Slab>
      <g className="animate-float">
        <Check cx={430} cy={120} r={26} />
      </g>
      <g className="animate-float-slow">
        <Coin cx={118} cy={150} r={22} />
        <Coin cx={86} cy={196} r={16} />
      </g>
      {/* bell */}
      <g className="animate-float-slow" transform="translate(436 250)">
        <path d="M0 40c0-26 10-40 30-40s30 14 30 40l8 10H-8z" fill={C.yellow} />
        <path d="M-8 50h76v8H-8z" fill={C.yellowDeep} />
        <circle cx="30" cy="66" r="8" fill={C.yellowDeep} />
      </g>
      {/* star badge */}
      <g className="animate-float" transform="translate(96 278)">
        <circle cx="30" cy="34" r="30" fill={C.purple} />
        <circle cx="30" cy="30" r="30" fill="#9B7FF0" />
        <path d="M30 14l5 11 12 2-9 8 2 12-10-6-10 6 2-12-9-8 12-2z" fill={C.white} />
      </g>
      <Kola wave x={226} y={230} width={140} height={160} />
    </svg>
  );
}

export function AttendanceScene(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 480 380" fill="none" aria-hidden {...props}>
      <circle cx="240" cy="190" r="160" fill="#E8F6EB" />
      <Slab x={150} y={40} w={180} h={300} face={C.white} edge={C.greenDeep} rotate={8} depth={14} r={28}>
        <rect x={150} y={40} width={180} height={300} rx={28} fill="none" stroke={C.green} strokeWidth="8" />
        <rect x={172} y={70} width={136} height={12} rx={6} fill={C.line} />
        <rect x={172} y={70} width={92} height={12} rx={6} fill={C.green} />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <circle cx={186} cy={118 + i * 44} r={13} fill={["#F28BC1", "#1A8FD6", "#FFC83D", "#7C5CDB", "#FE6007"][i]} />
            <rect x={208} y={112 + i * 44} width={60} height={10} rx={5} fill={C.line} />
            <circle cx={292} cy={118 + i * 44} r={11} fill={i === 2 ? "#F05A5F" : C.green} />
          </g>
        ))}
      </Slab>
      <g className="animate-float">
        <Check cx={380} cy={90} r={30} />
      </g>
      <g className="animate-float-slow" transform="translate(70 220)">
        <path d="M10 40a22 22 0 0 1 4-43 30 30 0 0 1 56 4 20 20 0 0 1 6 39z" fill={C.white} stroke={C.line} strokeWidth="4" />
        <path d="M24 22l40 0M30 30l28 0" stroke="#9C968E" strokeWidth="5" strokeLinecap="round" />
        <path d="M18 10l52 34" stroke="#F05A5F" strokeWidth="5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function ReportScene(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 480 380" fill="none" aria-hidden {...props}>
      <circle cx="240" cy="190" r="160" fill="#F1EDFD" />
      <Slab x={120} y={96} w={220} h={250} face="#EAE4FB" edge="#C9BCF3" rotate={-10} r={20} />
      <Slab x={140} y={70} w={220} h={260} face={C.white} edge={C.line} rotate={4} r={20} depth={12}>
        <rect x={160} y={92} width={110} height={14} rx={7} fill={C.purple} />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect x={160} y={130 + i * 36} width={100} height={10} rx={5} fill={C.line} />
            <rect x={292} y={122 + i * 36} width={46} height={26} rx={9} fill={i === 3 ? C.blue : C.green} />
            <text x={315} y={140 + i * 36} textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="14" fill={C.white}>
              {i === 3 ? "B2" : "A1"}
            </text>
          </g>
        ))}
      </Slab>
      <g className="animate-float" transform="translate(330 40)">
        <path d="M20 60l-12 50 22-12 22 12-12-50z" fill={C.blue} />
        <circle cx="30" cy="40" r="34" fill={C.yellowDeep} />
        <circle cx="30" cy="36" r="34" fill={C.yellow} />
        <path d="M30 18l5 11 12 2-9 8 2 12-10-6-10 6 2-12-9-8 12-2z" fill={C.white} />
      </g>
      {[[70, 80, C.pink], [90, 300, C.orange], [400, 300, C.green], [60, 190, C.blue]].map(([x, y, c], i) => (
        <rect key={i} x={x as number} y={y as number} width="16" height="16" rx="4" fill={c as string} transform={`rotate(${i * 25} ${x} ${y})`} />
      ))}
    </svg>
  );
}

export function FeesScene(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 480 380" fill="none" aria-hidden {...props}>
      <circle cx="240" cy="190" r="160" fill="#FFF6DD" />
      <Slab x={110} y={60} w={170} h={280} face={C.white} edge={C.blueDeep} rotate={-6} r={26} depth={14}>
        <rect x={110} y={60} width={170} height={280} rx={26} fill="none" stroke={C.blue} strokeWidth="8" />
        <rect x={132} y={92} width={126} height={70} rx={14} fill={C.blueLight} />
        <text x={195} y={136} textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="24" fill={C.blueDeep}>
          ₦45,000
        </text>
        <Bars x={132} y={184} widths={[126, 96, 110]} />
        <rect x={132} y={264} width={126} height={40} rx={12} fill={C.orangeDeep} />
        <rect x={132} y={258} width={126} height={40} rx={12} fill={C.orange} />
        <rect x={168} y={273} width={54} height={10} rx={5} fill="#FFD2B4" />
      </Slab>
      <g className="animate-float">
        <Coin cx={330} cy={110} r={30} />
      </g>
      <g className="animate-float-slow">
        <Coin cx={388} cy={180} r={22} />
        <Coin cx={340} cy={232} r={16} />
      </g>
      <Slab x={300} y={260} w={120} h={86} face={C.white} edge={C.line} rotate={6} r={12} depth={8}>
        <Bars x={318} y={280} widths={[70, 50]} />
        <Check cx={392} cy={318} r={14} />
      </Slab>
    </svg>
  );
}

export function ParentsScene(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 480 380" fill="none" aria-hidden {...props}>
      <circle cx="240" cy="190" r="160" fill="#EAF5FD" />
      <Slab x={70} y={90} w={150} h={240} face={C.white} edge={C.line} rotate={-8} r={24} depth={12}>
        <rect x={86} y={120} width={100} height={34} rx={14} fill={C.paper} />
        <rect x={110} y={170} width={96} height={34} rx={14} fill={C.orange} />
        <rect x={86} y={220} width={84} height={34} rx={14} fill={C.paper} />
      </Slab>
      <Slab x={260} y={70} w={150} h={240} face={C.white} edge={C.line} rotate={8} r={24} depth={12}>
        <rect x={276} y={100} width={100} height={34} rx={14} fill={C.blue} />
        <rect x={300} y={150} width={92} height={34} rx={14} fill={C.paper} />
        <rect x={276} y={200} width={110} height={34} rx={14} fill={C.blue} />
      </Slab>
      <g className="animate-float" transform="translate(210 40)">
        <path d="M30 54C10 40 0 30 0 18 0 8 8 0 17 0c6 0 10 3 13 8 3-5 7-8 13-8 9 0 17 8 17 18 0 12-10 22-30 36z" fill={C.pink} />
      </g>
      <g className="animate-float-slow" transform="translate(212 300)">
        <circle cx="28" cy="28" r="28" fill={C.green} />
        <path d="M18 30h8v14h-8zM26 30l6-14c4 0 6 3 5 7l-1 5h8c3 0 5 3 4 6l-3 8c-1 2-3 3-5 3H26" fill={C.white} />
      </g>
    </svg>
  );
}

export function NigeriaScene(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 480 380" fill="none" aria-hidden {...props}>
      <circle cx="240" cy="190" r="160" fill="#E8F6EB" />
      {/* building */}
      <path d="M120 330V190l120-70 120 70v140z" fill="#F3E3D3" />
      <path d="M100 196l140-86 140 86-14 12-126-76-126 76z" fill={C.orange} />
      <rect x={120} y={322} width={240} height={14} rx={4} fill="#D9C4AE" />
      <rect x={214} y={250} width={52} height={80} rx={8} fill={C.blueDeep} />
      {[150, 300].map((x) => (
        <g key={x}>
          <rect x={x} y={220} width={36} height={36} rx={6} fill={C.blueLight} />
          <rect x={x} y={272} width={36} height={36} rx={6} fill={C.blueLight} />
        </g>
      ))}
      {/* flag */}
      <path d="M240 122V60" stroke="#8A7A6A" strokeWidth="5" strokeLinecap="round" />
      <g className="animate-float-slow">
        <rect x={242} y={60} width={20} height={34} fill={C.green} />
        <rect x={262} y={60} width={20} height={34} fill={C.white} />
        <rect x={282} y={60} width={20} height={34} fill={C.green} />
      </g>
      {/* term calendar pages */}
      {[1, 2, 3].map((n, i) => (
        <g key={n} className={i % 2 ? "animate-float" : "animate-float-slow"} transform={`translate(${44 + i * 30} ${236 + (i % 2) * 18}) rotate(${-14 + i * 12})`}>
          <rect x={0} y={6} width={56} height={60} rx={10} fill={C.line} />
          <rect x={0} y={0} width={56} height={60} rx={10} fill={C.white} />
          <rect x={0} y={0} width={56} height={16} rx={8} fill={C.orange} />
          <text x={28} y={50} textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="24" fill={C.ink}>
            {n}
          </text>
        </g>
      ))}
      <Kola x={340} y={60} width={90} height={100} />
    </svg>
  );
}
