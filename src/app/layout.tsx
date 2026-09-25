import type { Metadata, Viewport } from "next";
import { createServerSupabase } from "@/lib/supabase";
import { BottomNav } from "./BottomNav";
import { NavHistory } from "./NavHistory";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wrenchy — Nailed it.",
  description:
    "Find trusted, verified tradespeople near you. Payment held in the Wrenchy Vault until the job is done.",
};

// viewport-fit=cover lets the tab bar sit clear of the iPhone home indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Only decides whether the last tab says "Profile" or "Log in". Access
  // control lives in proxy.ts and RLS, never here.
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = !!user;

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="shell">
          {children}
          <BottomNav signedIn={signedIn} />
          <NavHistory />
        </div>
      </body>
    </html>
  );
}
