import { getClientSession } from "../lib/session";
import { HeaderNav } from "./HeaderNav";
import Logo from "./Logo";

export default function Header() {
  const session = getClientSession();
  const showManage = !!session;
  return (
    <header className="sticky top-0 z-20 bg-[#143648]/95 text-white backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <div className="flex items-center gap-4">
          <Logo />
          <span className="hidden border-l border-white/20 pl-4 text-xs uppercase tracking-wider text-white/70 sm:inline">
            Espace Client
          </span>
        </div>
        <HeaderNav showManage={showManage} />
      </div>
    </header>
  );
}
