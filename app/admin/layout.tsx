"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { useLanguage } from "../../components/LanguageProvider";
import { LanguageToggle } from "../../components/LanguageToggle";
import type { TranslationKey } from "../../lib/i18n";

const links: { href: string; labelKey: TranslationKey }[] = [
  { href: "/admin", labelKey: "nav.dashboard" },
  { href: "/admin/availability", labelKey: "nav.agenda" },
  { href: "/admin/clients", labelKey: "nav.clients" },
  { href: "/admin/bookings", labelKey: "nav.bookings" },
  { href: "/admin/settings", labelKey: "nav.settings" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-black pb-16 text-white md:pb-0">
      <header className="border-b border-border bg-background-elevated">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="font-[var(--font-playfair)] text-lg uppercase tracking-wider text-white">
            {t("nav.adminAgenda")}
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <nav className="flex items-center gap-3 text-sm">
              {links.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={active ? "nav-link nav-link-active" : "nav-link"}
                  >
                    {t(link.labelKey)}
                  </Link>
                );
              })}
            </nav>
            <LanguageToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8 md:py-12">{children}</main>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-border bg-black/95 backdrop-blur py-1 md:hidden">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 px-1 py-1 text-[11px] tracking-wide ${
                active ? "text-[#C8A060]" : "text-white/60 hover:text-white"
              }`}
            >
              <span className="text-xs font-semibold leading-tight text-center">{t(link.labelKey)}</span>
            </Link>
          );
        })}
        <LanguageToggle />
      </nav>
    </div>
  );
}
