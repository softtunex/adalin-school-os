import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Nunito } from "next/font/google";
import type { ReactNode } from "react";
import { hostSchool } from "@/lib/auth/host";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import { getTextSize, getTheme } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Rounded display face for marketing headlines only; the app itself is all Geist.
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["800", "900"] });

/** On a school's own web address, tabs carry the school's name instead of ours. */
export async function generateMetadata(): Promise<Metadata> {
  const school = await hostSchool();
  const name = school?.name ?? APP_NAME;
  return { title: { default: name, template: `%s · ${name}` }, description: school ? `${school.name}: results, fees, attendance and messages.` : APP_TAGLINE, applicationName: name };
}

export const viewport: Viewport = {
  themeColor: "#fe6007",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [theme, textSize] = await Promise.all([getTheme(), getTextSize()]);
  return (
    <html lang="en" data-theme={theme} data-text-size={textSize === "default" ? undefined : textSize} className={`${geistSans.variable} ${geistMono.variable} ${nunito.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
