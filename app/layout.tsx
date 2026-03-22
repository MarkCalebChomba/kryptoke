import type { Metadata, Viewport } from "next";
import { Syne, DM_Mono, Outfit } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "@/components/shared/Providers";

/**
 * Next.js Web Vitals reporting.
 * Must be named exactly 'reportWebVitals' and exported from root layout.
 * Called automatically by Next.js with LCP, FID, CLS, TTFB, FCP metrics.
 */
export function reportWebVitals({
  name,
  value,
}: {
  name: string;
  value: number;
  id: string;
  label: string;
  startTime: number;
}): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({
    metric: name,
    value: Math.round(name === "CLS" ? value * 1000 : value),
    route: window.location.pathname,
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/v1/metrics/web-vitals",
        new Blob([body], { type: "application/json" })
      );
    } else {
      fetch("/api/v1/metrics/web-vitals", {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    // Never throw from Web Vitals — non-critical
  }
}

/* ─── Fonts ─────────────────────────────────────────────────────────────── */

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
  preload: true,
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-dm-mono",
  display: "swap",
  preload: true,
});

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-outfit",
  display: "swap",
  preload: true,
});

/* ─── Metadata ───────────────────────────────────────────────────────────── */

export const metadata: Metadata = {
  title: {
    template: "%s | KryptoKe",
    default: "KryptoKe — Kenya's Crypto Exchange",
  },
  description:
    "Buy, sell, and trade cryptocurrency in Kenya. Instant M-Pesa deposits and withdrawals. KES trading pairs.",
  keywords: ["crypto", "Kenya", "Bitcoin", "USDT", "M-Pesa", "exchange", "KES"],
  authors: [{ name: "KryptoKe" }],
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ),
  openGraph: {
    type: "website",
    locale: "en_KE",
    url: "https://kryptoke.com",
    title: "KryptoKe — Kenya's Crypto Exchange",
    description: "Buy, sell, and trade cryptocurrency in Kenya. Instant M-Pesa deposits.",
    siteName: "KryptoKe",
  },
  twitter: {
    card: "summary",
    title: "KryptoKe — Kenya's Crypto Exchange",
    description: "Trade crypto with M-Pesa in Kenya.",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KryptoKe",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#080C14",
  colorScheme: "dark",
};

/* ─── Root Layout ────────────────────────────────────────────────────────── */

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${dmMono.variable} ${outfit.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
      </head>
      <body className="bg-bg text-text-primary font-body antialiased overflow-hidden">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
