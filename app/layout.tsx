import type { Metadata } from "next";
import "./globals.css";
import { Playfair_Display, Inter } from "next/font/google";
import { Suspense } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import RoutePrefetcher from "../components/RoutePrefetcher";
import { ToastProvider } from "../components/ToastProvider";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-playfair"
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter"
});

export const metadata: Metadata = {
  title: "Geoffrey Mahieu | Espace Client",
  description: "Prise de rendez-vous privée pour les clients de Geoffrey Mahieu"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={`${playfair.variable} ${inter.variable} bg-black text-white`}>
        <Suspense fallback={null}>
          <ToastProvider />
          <RoutePrefetcher />
        </Suspense>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
