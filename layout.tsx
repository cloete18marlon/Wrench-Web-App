import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wrenchy — Nailed it.",
  description:
    "Find trusted, verified tradespeople near you. Payment held in the Wrenchy Vault until the job is done.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
