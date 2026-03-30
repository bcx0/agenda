"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { Locale, TranslationKey } from "../lib/i18n";
import { t as translate, translateStatus as tStatus, translateSlotStatus as tSlotStatus, translateMode as tMode, DEFAULT_LOCALE, COOKIE_NAME } from "../lib/i18n";

type LanguageContextType = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
  translateStatus: (status: string) => string;
  translateSlotStatus: (status: string) => string;
  translateMode: (mode: string) => string;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

function getCookieLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  const val = match?.[1];
  if (val === "en" || val === "fr") return val;
  return DEFAULT_LOCALE;
}

function setCookieLocale(locale: Locale) {
  document.cookie = `${COOKIE_NAME}=${locale};path=/;max-age=${365 * 24 * 60 * 60};SameSite=Lax`;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(getCookieLocale());
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    setCookieLocale(newLocale);
  }, []);

  const ctx: LanguageContextType = {
    locale,
    setLocale,
    t: (key: TranslationKey) => translate(key, locale),
    translateStatus: (status: string) => tStatus(status, locale),
    translateSlotStatus: (status: string) => tSlotStatus(status, locale),
    translateMode: (mode: string) => tMode(mode, locale),
  };

  return (
    <LanguageContext.Provider value={ctx}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Fallback for server components or outside provider
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key: TranslationKey) => translate(key, DEFAULT_LOCALE),
      translateStatus: (status: string) => tStatus(status, DEFAULT_LOCALE),
      translateSlotStatus: (status: string) => tSlotStatus(status, DEFAULT_LOCALE),
      translateMode: (mode: string) => tMode(mode, DEFAULT_LOCALE),
    };
  }
  return ctx;
}
