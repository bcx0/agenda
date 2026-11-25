/**
 * Hooks de chargement Node pour les tests d'intégration (aucun effet en
 * production) :
 *  - charge les modules TypeScript du projet (lib/*.ts, app/.../*.ts) grâce au
 *    retrait de types natif de Node 22 ;
 *  - résout l'alias "@/..." et les imports sans extension ;
 *  - remplace les dépendances EXTERNES par des doublures : Google Calendar
 *    (calendrier en mémoire), emails, webhook Make, session admin, cache Next,
 *    client Prisma (base PostgreSQL isolée de test).
 */
import { existsSync, statSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);
const FAKES = new URL("./fakes/", import.meta.url);

// Chemin du projet (sans extension) → doublure.
const MODULE_FAKES = {
  "lib/google-calendar": "google-calendar.mjs",
  "lib/email/booking": "email.mjs",
  "lib/makeWebhook": "make-webhook.mjs",
  "lib/prisma": "prisma.mjs",
  "lib/session": "session.mjs"
};
const PACKAGE_FAKES = {
  "next/cache": "next-cache.mjs",
  "next/navigation": "next-navigation.mjs",
  "next/server": "next-server.mjs",
  "next/headers": "next-headers.mjs",
  resend: "resend.mjs",
  "@prisma/client": "prisma-client.mjs",
  "@prisma/client/runtime/library": "prisma-client.mjs"
};

function isFile(url) {
  try {
    return statSync(url).isFile();
  } catch {
    return false;
  }
}

function projectRelative(url) {
  const href = url.href.replace(/\?.*$/, "");
  if (!href.startsWith(ROOT.href) || href.includes("/node_modules/")) return null;
  return href.slice(ROOT.href.length);
}

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL ?? "";
  const fromProject = parent.startsWith(ROOT.href) && !parent.includes("/node_modules/") && !parent.startsWith(FAKES.href);

  if (fromProject && PACKAGE_FAKES[specifier]) {
    return { url: new URL(PACKAGE_FAKES[specifier], FAKES).href, shortCircuit: true };
  }

  let spec = specifier;
  if (spec.startsWith("@/")) spec = new URL(spec.slice(2), ROOT).href;

  if (fromProject && (spec.startsWith(".") || spec.startsWith("file:"))) {
    const base = new URL(spec, parent);
    const candidates = isFile(base)
      ? [base]
      : [".ts", ".tsx", ".mjs", ".js", "/index.ts"].map((ext) => new URL(base.href + ext));
    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue;
      const rel = projectRelative(candidate);
      const key = rel?.replace(/\.(ts|tsx|mjs|js)$/, "");
      if (key && MODULE_FAKES[key]) {
        return { url: new URL(MODULE_FAKES[key], FAKES).href, shortCircuit: true };
      }
      return { url: candidate.href, shortCircuit: true, format: candidate.href.endsWith(".ts") ? "module-typescript" : undefined };
    }
  }
  return nextResolve(spec, context);
}
