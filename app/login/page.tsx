export const runtime = "nodejs";

import Link from "next/link";
import { getServerLocale, t } from "../../lib/i18n";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const locale = await getServerLocale();

  return (
    <section className="mx-auto max-w-5xl px-5 py-10 md:py-24">
      <div className="flex flex-col gap-10 md:grid md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div className="space-y-6">
          <p className="pill">{t("login.secureLogin", locale)}</p>
          <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider text-white md:text-4xl">
            {t("login.title", locale)}
          </h1>
          <p className="hidden italic text-lg text-white/70 md:block">
            « {t("login.quote", locale)} »
          </p>
          <ul className="hidden space-y-3 text-white/70 md:block">
            <li>— {t("login.verify", locale)}</li>
            <li>— {t("login.quota", locale)}</li>
            <li>— {t("login.realtime", locale)}</li>
          </ul>
        </div>
        <LoginForm />
      </div>

      <div className="mt-8 flex flex-col items-center gap-2">
        <Link
          href="/admin"
          className="text-xs uppercase tracking-widest text-white/40 hover:text-[#C8A060] transition-colors"
        >
          {t("common.admin", locale)}
        </Link>
        <p className="text-xs text-white/30">
          {t("footer.madeBy", locale)}{" "}
          <a
            href="https://lagencepartners.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/50 underline hover:text-[#C8A060] transition-colors"
          >
            {t("footer.agency", locale)}
          </a>
        </p>
      </div>
    </section>
  );
}



