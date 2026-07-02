import { getServerLocale, t } from "../lib/i18n";

export async function AgencyBranding() {
  const locale = await getServerLocale();

  return (
    <div className="card flex flex-col items-center justify-center gap-3 p-5 md:p-6">
      <span className="text-xs uppercase tracking-widest text-[#8A98A1]">
        {t("footer.madeBy", locale)}
      </span>
      <a
        href="https://lagencepartners.com"
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-lg bg-[#143648] px-4 py-2 hover:opacity-90 transition-opacity"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/lagence-logo.svg"
          alt="L'agence Partners"
          width={180}
          height={54}
          className="h-[54px] w-auto"
        />
      </a>
      <a
        href="mailto:lagence.groupe.partner@gmail.com"
        className="text-xs text-[#8A98A1] hover:text-[#5A6B76] transition-colors"
      >
        lagence.groupe.partner@gmail.com
      </a>
    </div>
  );
}
