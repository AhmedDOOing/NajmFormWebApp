import "./globals.css";
import type { ReactNode } from "react";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { Providers } from "@/components/providers";

// Brand type — neutral, government-grade, harmonizes Arabic + Latin. If Najm
// supplies a licensed face, swap to next/font/local and point --font-brand at
// it; the Google font then acts as the fallback.
const brand = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-brand",
  display: "swap",
});

export const metadata = {
  title: "Najm — Accident report handoff",
  description: "Complete your accident report",
};

// Mobile: cover the notch/safe-areas, lock zoom-on-rotate quirks, brand chrome.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover" as const,
  themeColor: "#0C1512",
};

// Root layout is RTL/Arabic-first + dark-first. Providers add RTL (Radix
// DirectionProvider), theme (next-themes), and Sonner toasts.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${brand.variable} dark`}
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
