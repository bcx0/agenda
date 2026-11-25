// Doublure de "@prisma/client" pour les modules du projet : expose le même
// espace de noms Prisma (classes d'erreur) que le client de test réellement
// utilisé, pour que les `instanceof Prisma.PrismaClientKnownRequestError`
// du code fonctionnent.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const mod = process.env.TEST_PRISMA_WASM_CLIENT
  ? require(process.env.TEST_PRISMA_WASM_CLIENT)
  : require("@prisma/client");
export const Prisma = mod.Prisma;
export const PrismaClient = mod.PrismaClient;
export const PrismaClientKnownRequestError = mod.Prisma.PrismaClientKnownRequestError;
export default mod;
