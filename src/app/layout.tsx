import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-data",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://rachna.ai"),
  title: {
    default: "Rachna AI — show the whole room, sell the whole room",
    template: "%s · Rachna AI",
  },
  description:
    "Rachna AI is the decision layer for building-material dealers. Customers see their own room clad in coatings, tile, wallpaper, laminate and stone — filtered by what you can supply today — and leave with an itemised quotation.",
  keywords: [
    "building material dealer software",
    "interior material visualisation",
    "dealer inventory intelligence",
    "tile wallpaper laminate coatings",
    "quotation generation for dealers",
  ],
  openGraph: {
    title: "Rachna AI",
    description:
      "Show the whole room. Sell the whole room. The decision layer for building-material dealers.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="bg-ink-900 text-paper-50 antialiased">{children}</body>
    </html>
  );
}
