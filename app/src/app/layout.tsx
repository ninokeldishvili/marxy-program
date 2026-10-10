import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import { Gate } from "@/components/Gate";
import { Header } from "@/components/Header";
import { MeshBackground } from "@/components/MeshBackground";
import { Providers } from "@/components/Providers";
import { IS_CONFIGURED } from "@/config";
import "./globals.css";

const heading = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-heading" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });

const TITLE = "MARXY — Buy. Lock. Battle. Win.";
const SHARE = "The last-bid crypto auction on Solana where the biggest wallet doesn't win. Strategy does.";

export const metadata: Metadata = {
  metadataBase: new URL("https://marxy.fun"),
  title: TITLE,
  description: "Buy. Lock. Battle. Win. MARXY is the last-bid crypto auction on Solana where strategy beats the biggest wallet.",
  icons: { icon: "/assets/favicon.png", apple: "/assets/apple-touch-icon.png" },
  openGraph: {
    type: "website",
    siteName: "MARXY",
    title: TITLE,
    description: SHARE,
    url: "/",
    images: [{ url: "/assets/og-image.jpg", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", site: "@marxyfun", title: TITLE, description: SHARE, images: ["/assets/og-image.jpg"] },
};

export const viewport: Viewport = { themeColor: "#050605" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body className="min-h-screen">
        <MeshBackground />
        <Providers>
          <Gate>
            <Header />
            {!IS_CONFIGURED && (
              <div className="mx-auto mt-4 max-w-6xl px-4">
                <p className="rounded-2xl border border-warn/50 bg-warn/10 px-4 py-3 text-sm text-warn">
                  No devnet addresses yet: run <code>npm run devnet:setup</code> in <code>app/</code>, then restart the app.
                </p>
              </div>
            )}
            <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
          </Gate>
        </Providers>
      </body>
    </html>
  );
}
