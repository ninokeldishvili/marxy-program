import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import { IS_CONFIGURED } from "@/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marxy: last bid wins",
  description: "Last-bid-wins crypto auctions on Solana devnet.",
  icons: { icon: "/marxy_logo.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>
          <Header />
          {!IS_CONFIGURED && (
            <div className="mx-auto mt-4 max-w-6xl px-4">
              <p className="rounded-xl border border-warn/50 bg-warn/10 px-4 py-3 text-sm text-warn">
                No devnet addresses yet: run <code>npm run devnet:setup</code> in <code>app/</code>, then restart the app.
              </p>
            </div>
          )}
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
