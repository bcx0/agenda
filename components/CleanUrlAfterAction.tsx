"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Removes ?success= / ?error= from the URL after the message has been shown,
 * so a refresh (F5) or a shared link does not replay a stale confirmation or
 * error banner. Uses history.replaceState (no soft navigation), so the
 * server-rendered banner stays visible until the next real navigation.
 */
export function CleanUrlAfterAction() {
  const params = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    if (!params || !pathname) return;
    if (!params.get("success") && !params.get("error")) return;
    const next = new URLSearchParams(params.toString());
    next.delete("success");
    next.delete("error");
    const url = next.toString() ? `${pathname}?${next.toString()}` : pathname;
    window.history.replaceState(null, "", url);
  }, [params, pathname]);

  return null;
}
