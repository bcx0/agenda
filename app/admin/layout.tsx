"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/availability", label: "Disponibilites" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/settings", label: "Settings" }
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-border bg-background-elevated">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="font-[var(--font-playfair)] text-lg uppercase tracking-wider text-white">
            Admin Agenda
          </div>
          <nav className="flex items-center gap-3 text-sm">
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
    </div>
  );
}
