"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Dashboard", icon: "home" },
  { href: "/admin/availability", label: "Dispo", icon: "calendar" },
  { href: "/admin/clients", label: "Clients", icon: "users" },
  { href: "/admin/bookings", label: "RDV", icon: "clipboard" },
  { href: "/admin/settings", label: "Réglages", icon: "cog" }
] as const;

function Icon({ kind }: { kind: (typeof links)[number]["icon"] }) {
  if (kind === "home") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <path d="M3 10.5L12 3l9 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M5.5 9.5V20h13V9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "calendar") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <rect x="3.5" y="5.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 3.5v4M16 3.5v4M3.5 9.5h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "users") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17" cy="10.5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 19c0-2.8 2.3-5 5-5s5 2.2 5 5M14 19c.2-1.9 1.8-3.5 3.8-3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "clipboard") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <rect x="5" y="4.5" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 4.5h6v3H9zM8.5 10.5h7M8.5 14h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 4v2.2M12 17.8V20M4 12h2.2M17.8 12H20M6.3 6.3l1.6 1.6M16.1 16.1l1.6 1.6M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  if (!pathname?.startsWith("/admin")) return null;

  return (
    <nav className="safe-area-inset-bottom fixed bottom-0 left-0 right-0 z-50 border-t border-gray-800 bg-[#0F0F0F] md:hidden">
      <div className="flex h-16 items-center justify-around">
        {links.map((link) => {
          const active =
            pathname === link.href ||
            (link.href !== "/admin" && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`touch-target flex h-full flex-1 flex-col items-center justify-center text-xs ${
                active ? "text-[#C8A060]" : "text-white/50"
              }`}
            >
              <Icon kind={link.icon} />
              <span className="mt-1 font-medium">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
