import { ImageResponse } from "next/og";
import { KOLA_SVG } from "./kola-svg";

const KOLA = `data:image/svg+xml;base64,${Buffer.from(KOLA_SVG).toString("base64")}`;

/**
 * The app icon: Kola on a soft cream tile (an orange tile would swallow the orange bird).
 * Maskable icons keep Kola inside the safe centre, since phones crop them into circles.
 */
export function appIcon(size: number, opts: { maskable?: boolean; radius?: boolean } = {}) {
  const art = Math.round(size * (opts.maskable ? 0.62 : 0.82));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fff0e6",
          borderRadius: opts.radius ? size * 0.22 : 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={KOLA} width={art} height={art} alt="" />
      </div>
    ),
    { width: size, height: size },
  );
}
