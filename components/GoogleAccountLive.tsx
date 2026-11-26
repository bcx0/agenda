"use client";

/**
 * Case « Compte Google connecté » (26/11/2026) : affiche le compte Google
 * réellement branché à l'agenda, interrogé en direct auprès de Google, et se
 * met à jour seule (toutes les 60 s, au retour sur l'onglet, ou à la demande).
 */

import { useCallback, useEffect, useRef, useState } from "react";

type Status = {
  connected: boolean;
  liveEmail: string | null;
  storedEmail: string | null;
  needsReauth: boolean;
  error: string | null;
  checkedAt: string;
};

const REFRESH_MS = 60_000;

export function GoogleAccountLive({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/google-account", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setStatus((await res.json()) as Status);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = setInterval(() => void check(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  const checkedAt = status
    ? new Date(status.checkedAt).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;
  const mismatch =
    !!status?.liveEmail && !!status.storedEmail && status.liveEmail.toLowerCase() !== status.storedEmail.toLowerCase();

  let dot = "bg-white/30";
  let title = "Vérification en cours…";
  let detail: string | null = null;
  if (failed && !status) {
    dot = "bg-red-400";
    title = "Vérification impossible";
    detail = "L'agenda n'a pas pu interroger Google. Nouvelle tentative automatique.";
  } else if (status && !status.connected) {
    dot = "bg-red-400";
    title = "Aucun compte Google connecté";
    detail = "Connectez Google Calendar dans les réglages.";
  } else if (status?.liveEmail) {
    dot = mismatch ? "bg-amber-400" : "bg-green-400";
    title = status.liveEmail;
    detail = mismatch
      ? `Attention : le compte enregistré à la connexion était ${status.storedEmail}.`
      : "Confirmé par Google à l'instant.";
  } else if (status) {
    dot = status.needsReauth ? "bg-red-400" : "bg-amber-400";
    title = status.storedEmail ?? "Compte inconnu";
    detail = status.error ?? "Google n'a pas confirmé le compte.";
  }

  return (
    <div
      className={`rounded-lg border border-white/10 bg-[#0F0F0F] ${compact ? "px-3 py-2" : "px-4 py-3"}`}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-widest text-white/50">Compte Google connecté à l&apos;agenda</p>
        <button
          type="button"
          onClick={() => void check()}
          disabled={loading}
          className="rounded-md border border-white/20 px-2.5 py-1 text-xs text-white/80 transition hover:bg-white/5 disabled:opacity-50"
        >
          {loading ? "Vérification…" : "Vérifier maintenant"}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
        <p className="min-w-0 break-all text-sm font-semibold text-white/90">{title}</p>
      </div>
      {detail ? <p className={`mt-1 text-xs ${mismatch ? "text-amber-300" : "text-white/55"}`}>{detail}</p> : null}
      {checkedAt ? <p className="mt-1 text-[11px] text-white/35">Dernière vérification : {checkedAt}</p> : null}
    </div>
  );
}
