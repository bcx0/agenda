import Link from "next/link";
import { getClientSession } from "../lib/session";

const navItems = [
  { href: "/", label: "ACCUEIL" },
  { href: "/book", label: "PRENDRE RDV" }
];

export default function Header() {
  const session = getClientSession();
  const showManage = !!session;
  return (
    <header className="sticky top-0 z-20 bg-black/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <div className="flex items-center">
          <span className="text-xs tracking-wider uppercase text-white/70">
            Espace Client
          </span>
        </div>
        <nav className="flex items-center gap-6 text-xs font-semibold tracking-widest">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-primary">
              {item.label}
            </Link>
          ))}
          {showManage ? (
            <Link href="/manage" className="hover:text-primary">
              MES RDV
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
