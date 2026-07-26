import type { Metadata } from "next";
import "./globals.css";
import { Playfair_Display, Inter } from "next/font/google";
import { Suspense } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import RoutePrefetcher from "../components/RoutePrefetcher";
import { ToastProvider } from "../components/ToastProvider";
import { MobileNav } from "../components/MobileNav";
import { LanguageProvider } from "../components/LanguageProvider";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-playfair"
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter"
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
