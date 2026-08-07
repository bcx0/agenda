"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Rafraîchit silencieusement les données de la page à intervalle régulier
 * (router.refresh() re-exécute le rendu serveur SANS recharger la page ni
 * perdre l'état des formulaires). Utilisé sur les pages qui affichent des
 * rendez-vous : un RDV créé/supprimé côté Google (importé en ~3 s par le
 * webhook) apparaît ainsi à l'écran sans rechargement manuel.
 * Le rafraîchissement est suspendu quand l'onglet est masqué.
 */
export default function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };
    const id = setInterval(tick, intervalMs);
    // Rafraîchit aussi immédiatement quand on revient sur l'onglet
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);

  return null;
}
