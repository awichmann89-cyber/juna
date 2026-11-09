import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Selbst gehostet (SIL OFL): keine Abhängigkeit von Google Fonts beim Build
const nunito = localFont({
  src: "./fonts/nunito-latin-wght-normal.woff2",
  variable: "--font-nunito",
  weight: "200 1000",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://juna.app"),
  title: { default: "juna", template: "%s · juna" },
  description: "Aktionen der Leiterrunde gemeinsam planen – von der Jahresplanung bis zum Feedback.",
  applicationName: "juna",
  appleWebApp: {
    capable: true,
    title: "juna",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#15100d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
