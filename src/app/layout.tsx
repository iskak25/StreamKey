import type { ReactNode } from "react";
import type { Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

// Cyrillic Extended carries the Kyrgyz letters (ң, ө, ү). Self-hosted by next/font, so CSP font-src 'self' still holds.
const manrope = Manrope({ subsets: ["latin", "cyrillic", "cyrillic-ext"], display: "swap", variable: "--font-sans" });

export const metadata = { title: "StreamKey" };
export const viewport: Viewport = { themeColor: "#0C0D12", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
