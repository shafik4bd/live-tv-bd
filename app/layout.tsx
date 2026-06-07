import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = "https://live-tv-bd.vercel.app/";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#08111f" },
    { media: "(prefers-color-scheme: light)", color: "#08111f" },
  ],
};

export const metadata: Metadata = {
  title: "BD IPTV Player - FIFA WORLD CUP 2026 LIVE FREE",
  description:
    "Stream live TV channels with an admin-managed IPTV web player, HLS streaming, custom playlist support, featured segments, and popup controls.",
  keywords: [
    "IPTV",
    "FIFA World CUp 2026 live TV",
    "streaming",
    "HLS player",
    "TV channels",
    "Bangladesh TV",
    "sports live",
    "T Sports",
    "free TV",
    "online TV",
    "IPTV player",
    "m3u player",
    "web TV player",
  ],
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "IPTV Player",
    title: "IPTV Player - Watch Live TV Channels",
    description:
      "Stream live TV channels with an admin-managed IPTV web player, HLS streaming, custom playlist support, featured segments, and popup controls.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "IPTV Player live TV streaming interface",
        type: "image/png",
      },
    ],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.json",
  category: "entertainment",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
