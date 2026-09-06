import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agni Eye Command — Live Wildfire Intelligence",
  description:
    "Real-time wildfire command center powered by NASA FIRMS, GIBS vector tiles, VIIRS & MODIS satellite fire detections and NASA EONET event feeds. 100% live data, no placeholders.",
  keywords: [
    "NASA FIRMS",
    "wildfire monitoring",
    "VIIRS",
    "MODIS",
    "fire hotspots",
    "GIBS",
    "EONET",
    "live satellite data",
  ],
  authors: [{ name: "Agni Eye Command" }],
  openGraph: {
    title: "Agni Eye Command — Live Wildfire Intelligence",
    description: "Live NASA satellite wildfire monitoring command center",
    siteName: "Agni Eye Command",
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
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
