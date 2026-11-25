// Session admin toujours valide en test (le contrôle d'accès n'est pas l'objet de ces tests).
export function getAdminSession() {
  return globalThis.__TEST_NO_ADMIN__ ? null : { role: "admin" };
}
export function getClientSession() {
  return null;
}
export function setAdminSession() {}
export function clearAdminSession() {}
export function setClientSession() {}
export function clearClientSession() {}
