"use client";

import { useLanguage } from "./LanguageProvider";

export function LanguageToggle() {
  const { locale, setLocale } = useLanguage();

  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
      className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-xs font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors"
      title={locale === "fr" ? "Switch to English" : "Passer en français"}
    >
      {locale === "fr" ? (
        <>
          <FlagFR className="h-4 w-5 rounded-sm" />
          <span className="hidden sm:inline">FR</span>
        </>
      ) : (
        <>
          <FlagEN className="h-4 w-5 rounded-sm" />
          <span className="hidden sm:inline">EN</span>
        </>
      )}
    </button>
  );
}

function FlagFR({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 14" className={className} aria-hidden="true">
      <rect width="20" height="14" rx="1" fill="#fff" />
      <rect width="6.67" height="14" fill="#002395" />
      <rect x="13.33" width="6.67" height="14" fill="#ED2939" />
    </svg>
  );
}

function FlagEN({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 14" className={className} aria-hidden="true">
      <rect width="20" height="14" rx="1" fill="#012169" />
      <path d="M0 0L20 14M20 0L0 14" stroke="#fff" strokeWidth="2.5" />
      <path d="M0 0L20 14M20 0L0 14" stroke="#C8102E" strokeWidth="1.5" />
      <path d="M10 0V14M0 7H20" stroke="#fff" strokeWidth="4" />
      <path d="M10 0V14M0 7H20" stroke="#C8102E" strokeWidth="2.5" />
    </svg>
  );
}
