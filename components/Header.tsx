import { getClientSession } from "../lib/session";
import { HeaderNav } from "./HeaderNav";

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
        <HeaderNav showManage={showManage} />
      </div>
    </header>
  );
}
