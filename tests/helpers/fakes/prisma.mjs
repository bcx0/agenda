// Doublure de lib/prisma.ts : client Prisma de la base de test, remplaçable
// à chaud (test « redémarrage de l'application »).
function current() {
  const client = globalThis.__TEST_PRISMA__;
  if (!client) throw new Error("Client Prisma de test non initialisé");
  return client;
}
export const prisma = new Proxy(
  {},
  {
    get(_target, key) {
      const client = current();
      const value = client[key];
      return typeof value === "function" ? value.bind(client) : value;
    }
  }
);
