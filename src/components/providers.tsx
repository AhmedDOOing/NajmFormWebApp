"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";

// Radix/shadcn are LTR by default. We drive DirectionProvider from the live
// <html dir> attribute (which the language gate + form toggle already set), so
// Select/Dialog/Dropdown/Tooltip mirror correctly the moment the locale flips.
export function Providers({ children }: { children: ReactNode }) {
  const [dir, setDir] = useState<"ltr" | "rtl">("rtl");

  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDir(el.getAttribute("dir") === "ltr" ? "ltr" : "rtl");
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["dir"] });
    return () => mo.disconnect();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <DirectionProvider dir={dir}>
        {children}
        <Toaster richColors closeButton position="top-center" />
      </DirectionProvider>
    </ThemeProvider>
  );
}
