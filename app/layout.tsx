import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";
import { Suspense } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import RoutePrefetcher from "../components/RoutePrefetcher";
import { ToastProvider } from "../components/ToastProvider";
import { MobileNav } from "../components/MobileNav";
import { LanguageProvider } from "../components/LanguageProvider";

// Polices auto-hébergées (fichiers @fontsource 5.3.0, sous-ensemble latin) :
// next/font/google 14.2 plante au build depuis nov. 2026 en lisant la
// réponse de Google Fonts ("Cannot read properties of null (reading '1')").
const playfair = localFont({
  src: [
    { path: "./fonts/playfair-display-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/playfair-display-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/playfair-display-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/playfair-display-latin-700-normal.woff2", weight: "700", style: "normal" }
  ],
  variable: "--font-playfair",
  display: "swap"
});

const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap"
});

// Nom d'application aligné sur l'écran de consentement OAuth ("Agenda
// Geoffrey Mahieu") : la validation Google compare le nom configuré au
// contenu de la page d'accueil (title, og:site_name, contenu).
export const metadata: Metadata = {
  title: {
    default: "Agenda Geoffrey Mahieu",
    template: "%s | Agenda Geoffrey Mahieu"
  },
  description:
    "Agenda Geoffrey Mahieu : prise de rendez-vous privée pour les clients de Geoffrey Mahieu, coach mental. Synchronisé avec Google Calendar.",
  applicationName: "Agenda Geoffrey Mahieu",
  openGraph: {
    siteName: "Agenda Geoffrey Mahieu",
    title: "Agenda Geoffrey Mahieu",
    description:
      "Prise de rendez-vous privée pour les clients de Geoffrey Mahieu, coach mental."
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={`${playfair.variable} ${inter.variable} bg-[#F4F7F9] text-[#10222E]`}>
        <LanguageProvider>
          <Suspense fallback={null}>
            <ToastProvider />
            <RoutePrefetcher />
          </Suspense>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <MobileNav />
            <Footer />
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}
