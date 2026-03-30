"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "./LanguageProvider";
import type { Locale } from "../lib/i18n";

const languages: { code: Locale; label: string; Flag: React.FC<{ className?: string }> }[] = [
  { code: "fr", label: "Français", Flag: FlagFR },
  { code: "en", label: "English", Flag: FlagEN },
];

export function LanguageToggle() {
  const { locale, setLocale } = useLanguage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const current = languages.find((l) => l.code === locale) ?? languages[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-xs font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors"
      >
        <current.Flag className="h-4 w-5 rounded-sm" />
        <span className="hidden sm:inline">{current.code.toUpperCase()}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] overflow-hidden rounded-xl border border-border bg-[#0F0F0F] shadow-xl">
          {languages.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => {
                setLocale(lang.code);
                setOpen(false);
                router.refresh();
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                locale === lang.code
                  ? "bg-[#C8A060]/10 text-[#C8A060]"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <lang.Flag className="h-4 w-5 rounded-sm" />
              <span className="font-medium">{lang.label}</span>
              {locale === lang.code && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="ml-auto">
                  <path d="M3 7L6 10L11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
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
