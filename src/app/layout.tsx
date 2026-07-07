import "./globals.css";
import type { ReactNode } from "react";
import { IBM_Plex_Sans_Arabic } from "next/font/google";

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

// Root layout is RTL/Arabic-first; the brand font applies to both scripts.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={brand.variable}>
      <body>{children}</body>
    </html>
  );
}
