import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { Analytics } from "./analytics";
import { ownerAnalyticsLoaderScript } from "../lib/analytics-optout";
import "./globals.css";


const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.BASE_URL ?? "https://thepostdrop.dev"),
  title: "Postdrop",
  description: "Share web-renderable artifacts from your agents — public links, no login needed",
  alternates: { canonical: "./" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gaId = process.env.GA_MEASUREMENT_ID;
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">
        {children}
        <Toaster position="top-right" richColors />
        <Analytics />
        {gaId && (
          // Owner opt-out loader: injects GA + config only when not opted out;
          // an armed visit emits zero GA requests (sets ga-disable-<id>).
          <script dangerouslySetInnerHTML={{ __html: ownerAnalyticsLoaderScript(gaId) }} />
        )}
      </body>
    </html>
  );
}
