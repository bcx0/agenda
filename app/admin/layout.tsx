"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/availability", label: "Disponibilités" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/settings", label: "Settings" }
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-black pb-16 text-white md:pb-0">
      <header className="border-b border-border bg-background-elevated">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="font-[var(--font-playfair)] text-lg uppercase tracking-wider text-white">
            Admin Agenda
          </div>
          <nav className="hidden items-center gap-3 text-sm md:flex">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={active ? "nav-link nav-link-active" : "nav-link"}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8 md:py-12">{children}</main>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-border bg-black/95 backdrop-blur py-2 md:hidden">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] tracking-wide ${
                active ? "text-[#C8A060]" : "text-white/60 hover:text-white"
              }`}
            >
              <span className="text-xs font-semibold">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
