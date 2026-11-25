/**
 * Environnement ISOLÉ des tests d'intégration :
 *  - une base PostgreSQL neuve, créée pour le test puis détruite
 *    (TEST_PG = paramètres de connexion libpq, ex. "host=/tmp port=55432
 *    user=postgres") ; refus explicite si TEST_PG vise Supabase ;
 *  - schéma de production (fixtures) + migration du 25/11/2026 ;
 *  - code réel du projet (lib/*.ts, actions admin) chargé avec des doublures
 *    pour Google Calendar, emails, session et cache Next.
 *
 * Variante bac à sable sans moteur Prisma natif : TEST_PRISMA_WASM_CLIENT
 * (client généré avec previewFeatures = ["driverAdapters"]) et
 * TEST_PRISMA_ADAPTER_DIR (dossier contenant @prisma/adapter-pg et pg).
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire, register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PG = process.env.TEST_PG;
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

function psql(db, args, input) {
  return execFileSync("psql", [`${PG} dbname=${db}`, "-v", "ON_ERROR_STOP=1", "-qAt", ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
}

function conninfoToUrl(conninfo, dbname) {
  const params = Object.fromEntries(
    conninfo
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split("="))
      .filter(([k, v]) => k && v !== undefined)
  );
  const user = encodeURIComponent(params.user ?? "postgres");
  const password = params.password ? `:${encodeURIComponent(params.password)}` : "";
  const host = params.host ?? "localhost";
  const port = params.port ?? "5432";
  if (host.startsWith("/")) {
    return `postgresql://${user}${password}@localhost:${port}/${dbname}?host=${encodeURIComponent(host)}`;
  }
  return `postgresql://${user}${password}@${host}:${port}/${dbname}`;
}

export async function createPrismaClient(url) {
  if (process.env.TEST_PRISMA_WASM_CLIENT) {
    const { PrismaClient } = require(process.env.TEST_PRISMA_WASM_CLIENT);
    const dir = process.env.TEST_PRISMA_ADAPTER_DIR;
    const { PrismaPg } = await import(pathToFileURL(`${dir}/node_modules/@prisma/adapter-pg/dist/index.mjs`).href);
    const pg = (await import(pathToFileURL(`${dir}/node_modules/pg/lib/index.js`).href)).default;
    const pool = new pg.Pool({ connectionString: url, max: 8 });
    const client = new PrismaClient({ adapter: new PrismaPg(pool) });
    client.__pool = pool;
    return client;
  }
  const { PrismaClient } = require("@prisma/client");
  return new PrismaClient({ datasourceUrl: url });
}

export async function closePrismaClient(client) {
  await client.$disconnect().catch(() => {});
  if (client.__pool) await client.__pool.end().catch(() => {});
}

let hooksRegistered = false;

export async function setupIntegration() {
  if (!PG) return null;
  if (/supabase|pooler/i.test(PG)) {
    throw new Error("TEST_PG ne doit JAMAIS viser la base Supabase : base de test locale uniquement.");
  }
  const dbname = `agenda_it_${process.pid}_${Date.now()}`;
  psql("postgres", ["-c", `CREATE DATABASE ${dbname}`]);
  psql("postgres", ["-c", `ALTER DATABASE ${dbname} SET timezone TO 'UTC'`]);
  psql(dbname, ["-f", "-"], read("../fixtures/backup-schema.sql"));
  psql(dbname, ["-f", "-"], read("../fixtures/integration-extra-schema.sql"));
  psql(dbname, ["-f", "-"], read("../../prisma/migrations/20261125120000_recurring_occurrence_exceptions/migration.sql"));

  const url = conninfoToUrl(PG, dbname);
  process.env.DATABASE_URL = url;
  process.env.CRON_SECRET = process.env.CRON_SECRET ?? "test-cron-secret";
  globalThis.__TEST_PRISMA__ = await createPrismaClient(url);

  if (!hooksRegistered) {
    register("./ts-hooks.mjs", import.meta.url);
    hooksRegistered = true;
  }

  return {
    dbname,
    url,
    get prisma() {
      return globalThis.__TEST_PRISMA__;
    },
    sql(query) {
      return psql(dbname, ["-c", query]);
    },
    async swapClient() {
      const previous = globalThis.__TEST_PRISMA__;
      globalThis.__TEST_PRISMA__ = await createPrismaClient(url);
      await closePrismaClient(previous);
    },
    async teardown() {
      await closePrismaClient(globalThis.__TEST_PRISMA__);
      psql("postgres", ["-c", `DROP DATABASE IF EXISTS ${dbname} WITH (FORCE)`]);
    }
  };
}
