import { ImageResponse } from "next/og";

/** The app icon: "os" in white on Adalin orange. Maskable icons keep the mark in the safe centre. */
export function appIcon(size: number, opts: { maskable?: boolean; radius?: boolean } = {}) {
  const inset = opts.maskable ? 0.2 : 0.12;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FE6007",
          borderRadius: opts.radius ? size * 0.22 : 0,
        }}
      >
        <div
          style={{
            display: "flex",
            color: "#ffffff",
            fontSize: size * (1 - inset * 2) * 0.62,
            fontWeight: 800,
            letterSpacing: -size * 0.02,
            lineHeight: 1,
            marginTop: -size * 0.04,
          }}
        >
          os
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
