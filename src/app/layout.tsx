import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AGNI-EYE — Thermal-Source Triage for India",
  description:
    "Site-aware classification of satellite thermal hotspots over India: industrial fires, persistent industrial sources, crop burning and wildfires, each with explainable evidence. NASA FIRMS/VIIRS + OpenStreetMap + land cover. Smart India Hackathon 2026 · SIH26162.",
  keywords: [
    "SIH26162",
    "thermal anomaly classification",
    "industrial fire detection",
    "NASA FIRMS",
    "VIIRS",
    "OpenStreetMap",
    "persistent thermal sources",
    "India",
  ],
  authors: [{ name: "AGNI-EYE" }],
  openGraph: {
    title: "AGNI-EYE — Thermal-Source Triage for India",
    description: "Which of today's satellite hotspots are not routine — and why.",
    siteName: "AGNI-EYE",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen flex flex-col transition-colors duration-300`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
