"use client";

import Link from "next/link";
import { useLanguage } from "./LanguageProvider";
import { LanguageToggle } from "./LanguageToggle";

type Props = {
  showManage: boolean;
};

export function HeaderNav({ showManage }: Props) {
  const { t } = useLanguage();

  return (
    <nav className="flex items-center gap-4 text-xs font-semibold tracking-widest">
      <Link href="/" className="text-white/90 transition-colors hover:text-[#FF9B85]">
        {t("nav.home").toUpperCase()}
      </Link>
      <Link href="/book" className="text-white/90 transition-colors hover:text-[#FF9B85]">
        {t("nav.book").toUpperCase()}
      </Link>
      {showManage ? (
        <Link href="/manage" className="text-white/90 transition-colors hover:text-[#FF9B85]">
          {t("nav.myBookings").toUpperCase()}
        </Link>
      ) : null}
      <LanguageToggle />
    </nav>
  );
}
