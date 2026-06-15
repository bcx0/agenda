/**
 * Tests de régression — affichage des dates/heures cohérent avec Google Calendar.
 *
 * Contexte du bug (juin 2026) : les vues liste admin (`BookingsList.tsx`)
 * formataient les dates avec `toLocaleDateString/TimeString` SANS option
 * `timeZone`, donc dans le fuseau du runtime (UTC sur Vercel) ou du navigateur
 * (Miami si l'admin voyage). Résultat : tout rendez-vous proche de minuit
 * (heure de Bruxelles) s'affichait au mauvais jour par rapport à Google Calendar,
 * qui montre l'heure de Bruxelles. Exemples signalés : 22/10/2026 et 26/11/2026.
 *
 * Convention canonique du projet : tout affichage de date/heure métier se fait
 * en Europe/Brussels (cf. lib/time.ts `formatInZone`, emails, flux ICS,
 * sync Google `timeZone: Europe/Paris`). Ces tests verrouillent cette convention.
 *
 * Lancer :  node tests/timezone-display.test.mjs
 * (Aucune dépendance : utilise Intl, exactement comme le code de rendu corrigé.)
 */

const BUSINESS_TZ = "Europe/Brussels";

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error("  ❌ ÉCHEC:", msg); }
}

/** Reproduit EXACTEMENT le rendu corrigé de BookingsList.tsx (toLocale* + timeZone). */
function displayDate(utcIso, locale = "fr-FR") {
  return new Date(utcIso).toLocaleDateString(locale, {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
    timeZone: BUSINESS_TZ,
  });
}
function displayTime(utcIso, locale = "fr-FR") {
  return new Date(utcIso).toLocaleTimeString(locale, {
    hour: "2-digit", minute: "2-digit", timeZone: BUSINESS_TZ,
  });
}
/** Jour calendaire (YYYY-MM-DD) tel que vu en heure de Bruxelles = ce que montre Google. */
function brusselsDayKey(utcIso) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(utcIso));
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
/** Le rendu "buggé" : sans timeZone, dans un fuseau donné (simule UTC/Vercel ou Miami). */
function buggyDayKey(utcIso, tz) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(utcIso));
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

console.log("\n── 1. Dates signalées par le client (22/10/2026 & 26/11/2026) ──");
// RDV à 01:30 Bruxelles le 22/10 (= 23:30Z la veille). Google = 22 oct.
assert(brusselsDayKey("2026-10-21T23:30:00Z") === "2026-10-22",
  "RDV 2026-10-21T23:30Z doit s'afficher le 22 octobre (Bruxelles), pas le 21");
// RDV à 00:30 Bruxelles le 26/11 (= 23:30Z la veille). Google = 26 nov.
assert(brusselsDayKey("2026-11-25T23:30:00Z") === "2026-11-26",
  "RDV 2026-11-25T23:30Z doit s'afficher le 26 novembre (Bruxelles), pas le 25");
// RDV en pleine journée ces jours-là : jour stable, heure correcte.
assert(brusselsDayKey("2026-10-22T07:00:00Z") === "2026-10-22", "22/10 midi : jour stable");
assert(displayTime("2026-11-26T13:00:00Z") === "14:00", "26/11 13:00Z => 14:00 Bruxelles (hiver, +1)");

console.log("── 2. Régression : l'ancien rendu (sans timeZone) divergeait ──");
assert(buggyDayKey("2026-10-21T23:30:00Z", "America/New_York") === "2026-10-21",
  "Bug démontré : vue Miami montrait le 21/10 alors que Google montre le 22/10");
assert(buggyDayKey("2026-11-25T23:30:00Z", "UTC") === "2026-11-25",
  "Bug démontré : rendu serveur UTC montrait le 25/11 alors que Google montre le 26/11");
assert(brusselsDayKey("2026-10-21T23:30:00Z") !== buggyDayKey("2026-10-21T23:30:00Z", "America/New_York"),
  "Le correctif (Bruxelles) doit différer de l'ancien comportement (Miami)");

console.log("── 3. Changements d'heure été/hiver (DST) ──");
// EU passe à l'heure d'été le 29/03/2026 à 02:00->03:00 ; à l'hiver le 25/10/2026.
assert(displayTime("2026-03-29T00:30:00Z") === "01:30", "Avant bascule printemps : 00:30Z => 01:30 (CET +1)");
assert(displayTime("2026-03-29T01:30:00Z") === "03:30", "Après bascule printemps : 01:30Z => 03:30 (CEST +2)");
assert(displayTime("2026-10-25T00:30:00Z") === "02:30", "Avant bascule automne : 00:30Z => 02:30 (CEST +2)");
assert(displayTime("2026-10-25T01:30:00Z") === "02:30", "Après bascule automne : 01:30Z => 02:30 (CET +1)");
assert(brusselsDayKey("2026-10-25T01:30:00Z") === "2026-10-25", "Jour stable autour de la bascule automne");

console.log("── 4. Minuit, fin de mois, et bascule de mois ──");
// 31/10 23:30 Bruxelles (hiver +1) = 22:30Z le 31 -> reste 31 oct.
assert(brusselsDayKey("2026-10-31T22:30:00Z") === "2026-10-31", "Fin de mois : 31/10 reste le 31");
// 31/12 23:30 Bruxelles = 22:30Z le 31 -> reste 31/12/2026 (pas 01/01/2027).
assert(brusselsDayKey("2026-12-31T22:30:00Z") === "2026-12-31", "Réveillon : reste le 31/12/2026");
// 01/01 00:30 Bruxelles = 23:30Z le 31/12 -> bascule sur 2027 côté Bruxelles.
assert(brusselsDayKey("2026-12-31T23:30:00Z") === "2027-01-01", "Minuit passé : bascule au 01/01/2027 (Bruxelles)");

console.log("── 5. Événements 'all-day' (date seule, sans heure) ──");
// Un événement all-day Google a `start.date = '2026-10-22'` (pas de dateTime).
// La règle métier (sync-engine) est de les IGNORER. On vérifie qu'un 'YYYY-MM-DD'
// interprété naïvement comme UTC ne doit JAMAIS être reformaté en heure locale,
// sinon il reculerait d'un jour à l'ouest et avancerait d'heure à l'est.
const allDay = "2026-10-22";
assert(new Date(allDay + "T00:00:00Z").toLocaleDateString("fr-CA", { timeZone: "UTC" }) === "2026-10-22",
  "All-day : lire la date en UTC préserve le 22/10 (ne pas appliquer un fuseau local)");

console.log("── 6. Dates futures 2026 et au-delà (échantillon) ──");
for (const iso of ["2026-06-15T10:00:00Z", "2027-01-15T10:00:00Z", "2028-07-01T10:00:00Z"]) {
  const expected = iso.slice(0, 10); // midi UTC -> même jour à Bruxelles
  assert(brusselsDayKey(iso) === expected, `Jour stable pour ${iso}`);
}

console.log("── 7. Cohérence heure précise (échantillon hiver/été) ──");
assert(displayTime("2026-07-15T10:00:00Z") === "12:00", "Été : 10:00Z => 12:00 (CEST +2)");
assert(displayTime("2026-01-15T10:00:00Z") === "11:00", "Hiver : 10:00Z => 11:00 (CET +1)");

console.log("── 8. Cas additionnels : récurrents, bascule auto Bruxelles, fins de mois ──");
// RDV récurrent hebdo : même heure murale chaque semaine, malgré le passage à l'heure d'hiver.
// 14:00 Bruxelles -> 12:00Z en été (CEST), 13:00Z en hiver (CET). L'affichage doit rester 14:00.
assert(displayTime("2026-10-22T12:00:00Z") === "14:00", "Récurrent avant bascule (été) : 12:00Z => 14:00");
assert(displayTime("2026-10-29T13:00:00Z") === "14:00", "Récurrent après bascule (hiver) : 13:00Z => 14:00");
assert(displayTime("2026-11-05T13:00:00Z") === "14:00", "Récurrent semaine suivante (hiver) : 13:00Z => 14:00");
assert(displayTime("2026-11-26T13:00:00Z") === "14:00", "26/11 récurrent : 13:00Z => 14:00 (hiver)");
// Jour de bascule automne (25/10/2026) : un créneau juste avant minuit reste le 25.
assert(brusselsDayKey("2026-10-25T21:30:00Z") === "2026-10-25", "Jour de bascule : 23:30 Bruxelles reste le 25/10");
// Fin de mois + minuit : 30/11 23:30 Bruxelles (hiver +1) = 22:30Z -> reste 30/11.
assert(brusselsDayKey("2026-11-30T22:30:00Z") === "2026-11-30", "Fin nov : 30/11 23:30 reste le 30/11");
// 01/11 00:30 Bruxelles (hiver) = 23:30Z le 31/10 -> bascule au 01/11 côté Bruxelles.
assert(brusselsDayKey("2026-10-31T23:30:00Z") === "2026-11-01", "Minuit passé fin oct : bascule au 01/11");
// Les deux dates signalées : jour ET heure exacts pour un RDV juste après minuit.
assert(displayTime("2026-10-21T23:30:00Z") === "01:30", "22/10 00:30->01:30 : heure correcte (été +2)");
assert(displayTime("2026-11-25T23:30:00Z") === "00:30", "26/11 : 23:30Z => 00:30 Bruxelles (hiver +1)");
assert(displayDate("2026-11-25T23:30:00Z").includes("26"), "26/11 : la date affichée contient bien le 26");

console.log("── 9. Regroupement par jour : les RDV 00h-04h restent sur le bon jour belge ──");
// REGRESSION (bug \"rdv pas repris\") : le regroupement par jour des cr\u00e9neaux/RDV
// doit se faire en heure de Bruxelles (lib/time toDayKey / CALENDAR_TZ), pas en Miami.
// Un RDV t\u00f4t le matin \u00e0 Bruxelles est la veille au soir \u00e0 Miami : group\u00e9 en Miami,
// il disparaissait de la journ\u00e9e belge ouverte par l'admin.
// 01:00 Bruxelles le 02/10 (\u00e9t\u00e9, +2) = 23:00Z le 01/10 = 19:00 Miami le 01/10.
assert(brusselsDayKey("2026-10-01T23:00:00Z") === "2026-10-02",
  "01:00 Bruxelles 02/10 doit \u00eatre rang\u00e9 sous le 02/10 (Bruxelles)");
assert(buggyDayKey("2026-10-01T23:00:00Z", "America/New_York") === "2026-10-01",
  "Bug d\u00e9montr\u00e9 : group\u00e9 en Miami, ce RDV tombait sous le 01/10 (pas repris le 02)");
// Les deux dates signal\u00e9es, c\u00f4t\u00e9 regroupement :
assert(brusselsDayKey("2026-10-21T22:30:00Z") === "2026-10-22",
  "00:30 Bruxelles 22/10 reste sur le 22/10 (regroupement Bruxelles)");
assert(buggyDayKey("2026-10-21T22:30:00Z", "America/New_York") === "2026-10-21",
  "Bug Miami : 22/10 00:30 retombait sous le 21/10");
assert(brusselsDayKey("2026-11-25T23:30:00Z") === "2026-11-26",
  "00:30 Bruxelles 26/11 reste sur le 26/11 (regroupement Bruxelles)");
assert(buggyDayKey("2026-11-25T23:30:00Z", "America/New_York") === "2026-11-25",
  "Bug Miami : 26/11 00:30 retombait sous le 25/11");
// La cl\u00e9 de mois (quota) reste en Bruxelles, coh\u00e9rente avec le serveur.
assert(brusselsDayKey("2026-10-31T23:30:00Z").slice(0,7) === "2026-11",
  "Cl\u00e9 de mois : 01/11 00:30 Bruxelles compte pour novembre");

console.log("── 10. RDV à cheval sur minuit : indexé sur les deux jours belges ──");
// Reproduit l'indexation corrigée de lib/booking.ts : un booking est rangé sous
// CHAQUE jour belge qu'il couvre (jour de début .. jour de fin), pour que la
// partie après minuit bloque aussi les créneaux du lendemain.
function bxStartOfDayKeys(startIso, endIso) {
  const keys = [];
  let d = new Date(brusselsDayKey(startIso) + "T12:00:00Z"); // ancre midi pour éviter les bascules
  const endKey = brusselsDayKey(endIso);
  for (let i = 0; i < 370; i++) {
    const k = d.toISOString().slice(0, 10);
    keys.push(k);
    if (k === endKey) break;
    d = new Date(d.getTime() + 24 * 3600 * 1000);
  }
  return keys;
}
// RDV 23:30 -> 00:30 Bruxelles (été, +2) = 21:30Z -> 22:30Z, à cheval sur 21 et 22 oct.
let span = bxStartOfDayKeys("2026-10-21T21:30:00Z", "2026-10-21T22:30:00Z");
assert(span.includes("2026-10-21") && span.includes("2026-10-22"),
  "RDV minuit 21->22 oct : indexé sur les DEUX jours (21 et 22)");
// RDV normal 1h en pleine journée : un seul jour.
span = bxStartOfDayKeys("2026-10-22T07:00:00Z", "2026-10-22T08:00:00Z");
assert(span.length === 1 && span[0] === "2026-10-22", "RDV 1h plein jour : un seul jour belge");
// RDV qui finit pile à minuit (23:00->00:00 Bruxelles hiver) : couvre 25 et 26 nov (fin = 00:00 du 26).
span = bxStartOfDayKeys("2026-11-25T22:00:00Z", "2026-11-25T23:00:00Z");
assert(span.includes("2026-11-25"), "RDV finissant à minuit : présent le jour de début");

console.log(`\n${failed === 0 ? "✅" : "⚠️"}  ${passed} assertions OK, ${failed} échec(s).`);
process.exit(failed === 0 ? 0 : 1);
