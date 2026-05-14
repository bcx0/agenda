import Link from "next/link";
import Image from "next/image";
import { getClientSession } from "../lib/session";
import { HeaderNav } from "./HeaderNav";

export default function Header() {
  const session = getClientSession();
  const showManage = !!session;
  return (
    <header className="sticky top-0 z-20 bg-black/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-3" aria-label="Geoffrey Mahieu">
          <Image
            src="/geoffrey-logo.png"
            alt="Geoffrey Mahieu"
            width={40}
            height={40}
            priority
            className="h-10 w-auto"
          />
          <span className="text-xs tracking-wider uppercase text-white/70">
            Espace Client
          </span>
        </Link>
        <HeaderNav showManage={showManage} />
      </div>
    </header>
  );
}
