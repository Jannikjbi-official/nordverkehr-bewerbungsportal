import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Serif_Display, JetBrains_Mono } from "next/font/google";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ConfirmHost } from "@/components/ConfirmDialog";
import { publicEnv } from "@/lib/env";
import "./globals.css";

const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.appUrl),
  title: { default: "Team-Bewerbung | Nordverkehr", template: "%s | Nordverkehr" },
  description:
    "Werde Teil des Teams von Nordverkehr – Hamburg-Roleplay. Offene Positionen ansehen, ehrlich bewerben, Status jederzeit verfolgen.",
  icons: { icon: "/logo.png", apple: "/logo.png" },
  openGraph: {
    type: "website",
    siteName: "Nordverkehr Roleplay",
    locale: "de_DE",
    images: [{ url: "/Nord-Verkehr-Wordmark.png", alt: "Nordverkehr Wordmark" }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#c41e1e",
  colorScheme: "dark light",
};

// Setzt das Theme vor dem ersten Paint (kein Aufblitzen). Standard: dunkel.
const themeScript = `(function(){try{var t=localStorage.getItem('nv-theme');if(t!=='light'&&t!=='dark'){t='dark'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      data-theme="dark"
      suppressHydrationWarning
      className={`${dmSerif.variable} ${dmSans.variable} ${jetbrains.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh flex flex-col">
        <a
          href="#inhalt"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] nv-btn nv-btn-primary"
        >
          Zum Inhalt springen
        </a>
        <SiteHeader />
        <main id="inhalt" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <ConfirmHost />
      </body>
    </html>
  );
}
