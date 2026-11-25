/**
 * Moteur de disponibilité UNIQUE (25/11/2026).
 *
 * Avant : deux calculs séparés et légèrement différents
 *   - getAvailability()       → ce que voient l'admin et les clients ;
 *   - checkSlotAvailability() → ce que le serveur accepte à la réservation.
 * Ils pouvaient diverger (créneau affiché puis refusé, ou l'inverse), et un
 * RecurringBlock bloquait CHAQUE semaine pour toujours : aucune exception par
 * date, aucune période de validité. Déplacer une occurrence d'un RDV régulier
 * déplaçait la réservation mais laissait l'ancien créneau bloqué (bloc fantôme
 * « All-in » du lundi 21h signalé par Geoffrey), et « Ajouter un créneau »
 * (exception OPEN) ne pouvait pas neutraliser un bloc récurrent.
 *
 * Ce module est PUR (aucune base, aucun réseau) : le serveur, l'admin et les
 * tests appellent exactement les mêmes fonctions, ils ne peuvent donc plus se
 * contredire.
 *
 * ── Priorité (de la plus forte à la plus faible) ────────────────────────────
 *   1. Réservation réelle (Booking CONFIRMED) : jamais écrasée.
 *   2. Indisponibilité explicite : exception BLOCK, bloc manuel ou événement
 *      Google importé (Block). Protégée tant qu'elle n'est pas levée.
 *   3. Exception d'occurrence (RecurringBlockException) : neutralise UNE
 *      occurrence d'une série à une date précise (SKIP = libérée, MOVE =
 *      déplacée). Une occurrence dont la réservation liée a été déplacée ou
 *      annulée est libérée automatiquement (état dérivé, aucun déclencheur).
 *   4. Règle récurrente (RecurringBlock) : bloque son créneau chaque semaine,
 *      dans sa période de validité (startDate/endDate), hors exception.
 *   5. Disponibilités habituelles (AvailabilityRule) ou ouvertures du jour
 *      (exception OPEN) : définissent les créneaux proposés.
 *
 * Conventions de dates :
 *   - instants = objets Date (UTC) ;
 *   - dates calendaires = chaînes "YYYY-MM-DD" ;
 *   - heures d'un RecurringBlock = heures murales dans SON fuseau (défaut
 *     Europe/Brussels), date d'occurrence comprise ;
 *   - exceptions OPEN/BLOCK (AvailabilityOverride) = date + heures de Bruxelles ;
 *   - règles hebdo = heure locale du lieu (Bruxelles ou Miami).
 */

import { DateTime } from "luxon";

export const BRUSSELS_TZ = "Europe/Brussels";
export const MIAMI_TZ = "America/New_York";
const DEFAULT_BLOCK_TZ = BRUSSELS_TZ;
const SLOT_MINUTES = 60;
const MINUTE_MS = 60 * 1000;

// Heures de travail par défaut quand aucun horaire n'est défini pour un lieu
// (mêmes valeurs que lib/time.ts : Miami 07:00-21:00, Bruxelles 09:00-19:00).
const FALLBACK_HOURS = {
  MIAMI: { start: "07:00", end: "21:00" },
  BELGIUM: { start: "09:00", end: "19:00" }
};

// ─── Outils ────────────────────────────────────────────────────────────────

/** "HH:mm" → minutes depuis minuit (24:00 accepté), ou null si invalide. */
export function toMinutes(value) {
  if (typeof value !== "string") return null;
  const [hourStr, minuteStr = "0"] = value.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  if (hour === 24 && minute !== 0) return null;
  return hour * 60 + minute;
}

/** minutes → "HH:mm". */
export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Normalise une date calendaire : chaîne "YYYY-MM-DD" ou Date issue d'une
 * colonne Postgres DATE (minuit UTC) → "YYYY-MM-DD". null si absente.
 * @param {string | Date | null | undefined} value
 * @returns {string | null}
 */
export function toIsoDateOnly(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

/** Date calendaire "YYYY-MM-DD" → Date à minuit UTC (colonne DATE). */
export function isoDateToDbDate(iso) {
  return new Date(`${iso}T00:00:00.000Z`);
}

// Formateurs Intl mis en cache : ~20x plus rapide que Luxon pour cette
// opération appelée des milliers de fois par calcul d'agenda.
const DATE_FORMATTERS = new Map();
function dateFormatter(zone) {
  let formatter = DATE_FORMATTERS.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
    DATE_FORMATTERS.set(zone, formatter);
  }
  return formatter;
}

/** Date calendaire ("YYYY-MM-DD") d'un instant dans un fuseau. */
export function isoDateInZone(instant, zone) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return "";
  const parts = dateFormatter(zone).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Ajoute n jours à une date calendaire. */
export function addDaysIso(iso, days) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Jour ISO (1 = lundi … 7 = dimanche) d'une date calendaire. */
export function weekdayOfIso(iso) {
  const day = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function overlaps(startA, endA, startB, endB) {
  return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();
}

/**
 * Instant correspondant à une heure murale (minutes) d'une date dans un fuseau.
 * Retourne null si l'heure n'existe pas ce jour-là (nuit du passage à l'heure
 * d'été : 02:30 à Bruxelles le dernier dimanche de mars).
 */
export function wallTimeToUtc(dateIso, minutes, zone, options = {}) {
  const day = DateTime.fromISO(dateIso, { zone });
  if (!day.isValid) return null;
  if (minutes === 24 * 60) {
    return day.plus({ days: 1 }).startOf("day").toUTC().toJSDate();
  }
  const local = day.set({
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
    second: 0,
    millisecond: 0
  });
  // `lenient` : une heure inexistante est reportée au premier instant valide
  // qui suit (02:30 → 03:30 la nuit du passage à l'heure d'été). Utilisé pour
  // les BLOCAGES (un bloc 02:00-04:00 doit couvrir 03:00-04:00 cette nuit-là) ;
  // les créneaux proposés, eux, ignorent l'heure inexistante.
  if (local.hour * 60 + local.minute !== minutes && !options.lenient) return null;
  return local.toUTC().toJSDate();
}

// ─── Lieu du jour (périodes Belgique) ──────────────────────────────────────

/**
 * Les périodes sont enregistrées en début/fin de journée À BRUXELLES puis
 * converties en UTC : on relit donc leurs dates dans le fuseau de Bruxelles.
 */
export function isBrusselsPeriodDate(dateIso, locationPeriods) {
  for (const period of locationPeriods ?? []) {
    const start = isoDateInZone(period.startDate, BRUSSELS_TZ);
    const end = isoDateInZone(period.endDate, BRUSSELS_TZ);
    if (start && end && dateIso >= start && dateIso <= end) return true;
  }
  return false;
}

export function locationForDate(dateIso, locationPeriods) {
  return isBrusselsPeriodDate(dateIso, locationPeriods) ? "BELGIUM" : "MIAMI";
}

function zoneForLocation(location) {
  return location === "BELGIUM" ? BRUSSELS_TZ : MIAMI_TZ;
}

// ─── Fenêtres de disponibilité ────────────────────────────────────────────

/**
 * Fenêtres de disponibilité d'une date calendaire.
 * - Ouvertures du jour (exceptions OPEN, heure de Bruxelles) : si elles
 *   existent, elles REMPLACENT les horaires habituels de ce jour.
 * - Sinon : règles hebdomadaires du lieu actif, en heure locale du lieu
 *   (ou horaires par défaut si aucun horaire n'est défini pour ce lieu).
 *
 * @returns {{ dateIso: string, zone: string, startMin: number, endMin: number,
 *   startUtc: Date, endUtc: Date, source: "override" | "rule" | "fallback",
 *   location: "MIAMI" | "BELGIUM" }[]}
 */
export function windowsForDate(dateIso, ctx) {
  const location = locationForDate(dateIso, ctx.locationPeriods);
  const openOverrides = (ctx.overrides ?? []).filter(
    (o) => o.type === "OPEN" && isoDateInZone(o.date, BRUSSELS_TZ) === dateIso
  );

  let ranges;
  let zone;
  let source;
  if (openOverrides.length > 0) {
    ranges = openOverrides;
    zone = BRUSSELS_TZ;
    source = "override";
  } else {
    const weekday = weekdayOfIso(dateIso);
    const locationRules = (ctx.rules ?? []).filter((r) => (r.location ?? "MIAMI") === location);
    zone = zoneForLocation(location);
    if (locationRules.length > 0) {
      ranges = locationRules.filter((r) => r.dayOfWeek === weekday);
      source = "rule";
    } else {
      ranges = [{ startTime: FALLBACK_HOURS[location].start, endTime: FALLBACK_HOURS[location].end }];
      source = "fallback";
    }
  }

  const windows = [];
  for (const range of ranges) {
    const startMin = toMinutes(range.startTime);
    const endMin = toMinutes(range.endTime);
    if (startMin === null || endMin === null || startMin >= endMin) continue;
    const startUtc = wallTimeToUtc(dateIso, startMin, zone);
    const endUtc = wallTimeToUtc(dateIso, endMin, zone);
    if (!startUtc || !endUtc) continue;
    windows.push({ dateIso, zone, startMin, endMin, startUtc, endUtc, source, location });
  }
  return windows;
}

// ─── Séries récurrentes ────────────────────────────────────────────────────

export function seriesZone(block) {
  return block.timeZone || DEFAULT_BLOCK_TZ;
}

/** La date est-elle dans la période de validité de la série ? */
export function isWithinSeriesPeriod(block, dateIso) {
  const start = toIsoDateOnly(block.startDate);
  const end = toIsoDateOnly(block.endDate);
  if (start && dateIso < start) return false;
  if (end && dateIso > end) return false;
  return true;
}

/**
 * Intervalle UTC de l'occurrence d'une série à une date (date dans le fuseau
 * de la série). null si ce n'est pas le bon jour ou si l'heure n'existe pas.
 */
export function occurrenceInterval(block, dateIso) {
  if (weekdayOfIso(dateIso) !== block.dayOfWeek) return null;
  const startMin = toMinutes(block.startTime);
  const endMin = toMinutes(block.endTime);
  if (startMin === null || endMin === null || endMin <= startMin) return null;
  const zone = seriesZone(block);
  const startUtc = wallTimeToUtc(dateIso, startMin, zone, { lenient: true });
  const endUtc = wallTimeToUtc(dateIso, endMin, zone, { lenient: true });
  if (!startUtc || !endUtc || endUtc.getTime() <= startUtc.getTime()) return null;
  return { startUtc, endUtc };
}

/** Prochaine date (incluse) portant le jour de la série. */
export function nextOccurrenceDate(block, fromIso) {
  let iso = fromIso;
  for (let i = 0; i < 7; i++) {
    if (weekdayOfIso(iso) === block.dayOfWeek) return iso;
    iso = addDaysIso(iso, 1);
  }
  return fromIso;
}

/**
 * Occurrences d'une série qui touchent [rangeStartUtc, rangeEndUtc), avec leur
 * état :
 *  - "active"   : l'occurrence bloque son créneau ;
 *  - "booked"   : une réservation liée occupe exactement l'occurrence (c'est
 *                 la réservation qui bloque, priorité 1) ;
 *  - "released" : libérée (exception SKIP, ou réservation liée déplacée ou
 *                 annulée, ou occurrence déplacée) ;
 *  - "moved"    : déplacée par une exception MOVE (l'ancien créneau est libre,
 *                 le nouveau est bloqué via `movedTo`).
 *
 * @param {object} block RecurringBlock
 * @param {{ exceptions?: object[], seriesBookings?: object[] }} ctx
 */
export function expandSeries(block, ctx, rangeStartUtc, rangeEndUtc) {
  const zone = seriesZone(block);
  const firstIso = addDaysIso(isoDateInZone(rangeStartUtc, zone), -1);
  const lastIso = addDaysIso(isoDateInZone(new Date(rangeEndUtc.getTime() - 1), zone), 1);
  // Regroupement par date (une seule passe) : une série client a ~50
  // réservations liées par an, consultées pour chaque occurrence.
  const exceptionsByDate = new Map();
  for (const e of ctx.exceptions ?? []) {
    if (e.recurringBlockId !== block.id) continue;
    exceptionsByDate.set(toIsoDateOnly(e.occurrenceDate), e);
  }
  const linkedByDate = new Map();
  for (const b of ctx.seriesBookings ?? []) {
    if (b.recurringBlockId !== block.id) continue;
    const key = toIsoDateOnly(b.occurrenceDate);
    if (!linkedByDate.has(key)) linkedByDate.set(key, []);
    linkedByDate.get(key).push(b);
  }

  const occurrences = [];
  let iso = nextOccurrenceDate(block, firstIso);
  // Garde : 400 semaines max par appel (l'agenda montre 365 jours).
  for (let i = 0; iso <= lastIso && i < 400; i++, iso = addDaysIso(iso, 7)) {
    if (!isWithinSeriesPeriod(block, iso)) continue;
    const interval = occurrenceInterval(block, iso);
    if (!interval) continue;
    if (!overlaps(interval.startUtc, interval.endUtc, rangeStartUtc, rangeEndUtc)) continue;
    occurrences.push(
      describeOccurrence(block, iso, interval, exceptionsByDate.get(iso) ?? null, linkedByDate.get(iso) ?? [])
    );
  }
  return occurrences;
}

function describeOccurrence(block, dateIso, interval, exception, bookingsForDate) {
  const base = {
    recurringBlockId: block.id,
    dateIso,
    startUtc: interval.startUtc,
    endUtc: interval.endUtc,
    exception: null,
    bookingId: null,
    movedTo: null
  };
  const bookedHere = bookingsForDate.find(
    (b) =>
      b.status === "CONFIRMED" &&
      Math.abs(new Date(b.startAt).getTime() - interval.startUtc.getTime()) < MINUTE_MS
  );

  // La réservation liée qui occupe exactement l'occurrence prime toujours.
  if (bookedHere) {
    return { ...base, state: "booked", reason: "booking", bookingId: bookedHere.id, exception };
  }
  if (exception) {
    if (exception.type === "MOVE" && exception.newStartAt && exception.newEndAt) {
      return {
        ...base,
        state: "moved",
        reason: "exception",
        exception,
        bookingId: exception.bookingId ?? null,
        movedTo: { startUtc: new Date(exception.newStartAt), endUtc: new Date(exception.newEndAt) }
      };
    }
    return { ...base, state: "released", reason: "exception", exception };
  }
  // État dérivé : la réservation créée pour cette occurrence a été déplacée
  // ou annulée (dans l'app, par le client ou depuis Google) → le créneau
  // d'origine est libéré, sans avoir besoin d'un déclencheur dans chaque
  // chemin de modification.
  if (bookingsForDate.length > 0) {
    const moved = bookingsForDate.find((b) => b.status === "CONFIRMED");
    return {
      ...base,
      state: "released",
      reason: moved ? "booking_moved" : "booking_cancelled",
      bookingId: (moved ?? bookingsForDate[0]).id,
      movedTo: moved ? { startUtc: new Date(moved.startAt), endUtc: new Date(moved.endAt) } : null
    };
  }
  return { ...base, state: "active", reason: null };
}

/**
 * Occurrences déplacées (exception MOVE sans réservation liée) dont le
 * NOUVEL horaire touche la fenêtre : elles bloquent ce nouvel horaire.
 */
export function movedInstancesInRange(ctx, rangeStartUtc, rangeEndUtc) {
  const blocksById = new Map((ctx.recurringBlocks ?? []).map((b) => [b.id, b]));
  const result = [];
  for (const exception of ctx.exceptions ?? []) {
    if (exception.type !== "MOVE" || !exception.newStartAt || !exception.newEndAt) continue;
    if (exception.bookingId) continue; // la réservation bloque elle-même
    const block = blocksById.get(exception.recurringBlockId);
    if (!block) continue;
    // Occurrence hors de la période de la série : la série n'existe pas cette
    // semaine-là, son déplacement non plus.
    const originDate = toIsoDateOnly(exception.occurrenceDate);
    if (!originDate || !isWithinSeriesPeriod(block, originDate)) continue;
    const startUtc = new Date(exception.newStartAt);
    const endUtc = new Date(exception.newEndAt);
    if (!overlaps(startUtc, endUtc, rangeStartUtc, rangeEndUtc)) continue;
    result.push({ block, exception, startUtc, endUtc });
  }
  return result;
}

/** Libellé lisible d'une série (diagnostic admin). */
export function seriesLabel(block) {
  const tzLabel = seriesZone(block) === MIAMI_TZ ? "Miami" : "Bruxelles";
  const base = `Bloc récurrent ${block.startTime}-${block.endTime} (${tzLabel})`;
  return block.note ? `${base} — ${block.note}` : base;
}

// ─── Bloqueurs ─────────────────────────────────────────────────────────────

/** Intervalle UTC d'une exception BLOCK (date + heures de Bruxelles). */
export function blockOverrideInterval(override) {
  const dateIso = isoDateInZone(override.date, BRUSSELS_TZ);
  const startMin = toMinutes(override.startTime);
  const endMin = toMinutes(override.endTime);
  if (!dateIso || startMin === null || endMin === null || endMin <= startMin) return null;
  const startUtc = wallTimeToUtc(dateIso, startMin, BRUSSELS_TZ, { lenient: true });
  const endUtc = wallTimeToUtc(dateIso, endMin, BRUSSELS_TZ, { lenient: true });
  if (!startUtc || !endUtc || endUtc.getTime() <= startUtc.getTime()) return null;
  return { startUtc, endUtc, dateIso };
}

function calendarBlockLabel(block) {
  const reason = block.reason ?? "";
  if (reason.startsWith("[NO_ACCOUNT]")) {
    const name = reason.replace("[NO_ACCOUNT] RDV — ", "").replace(" (non trouvé)", "").trim();
    return `RDV Google sans compte client : ${name}`;
  }
  return reason || "Bloc importé du calendrier";
}

/**
 * Prépare, UNE fois pour une fenêtre, tout ce qui peut bloquer un créneau :
 * réservations, indisponibilités explicites, blocs Google/manuels,
 * occurrences actives des séries et occurrences déplacées. Chaque élément
 * porte son intervalle en millisecondes et son « bloqueur » (cause lisible).
 */
export function prepareBlockers(ctx, rangeStartUtc, rangeEndUtc) {
  const items = [];
  const push = (startUtc, endUtc, blocker) =>
    items.push({ startMs: new Date(startUtc).getTime(), endMs: new Date(endUtc).getTime(), blocker });

  for (const booking of ctx.bookings ?? []) {
    if (booking.status && booking.status !== "CONFIRMED") continue;
    push(booking.startAt, booking.endAt, {
      kind: "booking",
      priority: 1,
      bookingId: booking.id,
      label: booking.clientName ? `Réservation : ${booking.clientName}` : "Réservation"
    });
  }
  for (const override of ctx.overrides ?? []) {
    if (override.type !== "BLOCK") continue;
    const interval = blockOverrideInterval(override);
    if (!interval) continue;
    push(interval.startUtc, interval.endUtc, {
      kind: "manual_block",
      priority: 2,
      overrideId: override.id,
      label: override.note
        ? `Indisponibilité manuelle ${override.startTime}-${override.endTime} — ${override.note}`
        : `Indisponibilité manuelle ${override.startTime}-${override.endTime}`
    });
  }
  for (const block of ctx.blocks ?? []) {
    const fromGoogle = block.syncSource === "google" || (!!block.googleEventId && block.syncSource !== "app");
    push(block.startAt, block.endAt, {
      kind: "calendar_block",
      priority: 2,
      blockId: block.id,
      fromGoogle,
      label: calendarBlockLabel(block)
    });
  }
  for (const series of ctx.recurringBlocks ?? []) {
    const label = seriesLabel(series);
    for (const occurrence of expandSeries(series, ctx, rangeStartUtc, rangeEndUtc)) {
      if (occurrence.state !== "active") continue;
      push(occurrence.startUtc, occurrence.endUtc, {
        kind: "recurring",
        priority: 3,
        recurringBlockId: series.id,
        occurrenceDate: occurrence.dateIso,
        clientId: series.clientId ?? null,
        label
      });
    }
  }
  for (const moved of movedInstancesInRange(ctx, rangeStartUtc, rangeEndUtc)) {
    push(moved.startUtc, moved.endUtc, {
      kind: "recurring",
      priority: 3,
      recurringBlockId: moved.block.id,
      occurrenceDate: toIsoDateOnly(moved.exception.occurrenceDate) ?? undefined,
      movedOccurrence: true,
      clientId: moved.block.clientId ?? null,
      label: `${seriesLabel(moved.block)} (occurrence déplacée du ${toIsoDateOnly(moved.exception.occurrenceDate)})`
    });
  }
  return items;
}

function blockersFromItems(items, startMs, endMs, options = {}) {
  const result = [];
  for (const item of items) {
    if (item.startMs >= endMs || item.endMs <= startMs) continue;
    if (options.excludeBookingId && item.blocker.kind === "booking" && item.blocker.bookingId === options.excludeBookingId) continue;
    result.push(item.blocker);
  }
  return result.sort((a, b) => a.priority - b.priority);
}

/**
 * Tout ce qui occupe [startUtc, endUtc), trié par priorité (1 = la plus
 * forte). Une liste vide signifie « libre » (si dans les disponibilités).
 *
 * @param {{ excludeBookingId?: number }} [options]
 * @returns {{ kind: "booking" | "manual_block" | "calendar_block" | "recurring",
 *   priority: number, label: string, bookingId?: number, overrideId?: number,
 *   blockId?: number, fromGoogle?: boolean, recurringBlockId?: number,
 *   occurrenceDate?: string, movedOccurrence?: boolean, clientId?: number | null }[]}
 */
export function findBlockers(startUtc, endUtc, ctx, options = {}) {
  const items = prepareBlockers(ctx, startUtc, endUtc);
  return blockersFromItems(items, startUtc.getTime(), endUtc.getTime(), options);
}

/** Statut d'un intervalle à partir de ses bloqueurs. */
export function statusFromBlockers(blockers) {
  if (blockers.some((b) => b.kind === "booking")) return "booked";
  if (blockers.length > 0) return "blocked";
  return "available";
}

// ─── Créneaux proposés et vérification serveur ─────────────────────────────

/**
 * Créneaux d'une heure générés depuis les fenêtres de chaque date, avec leur
 * statut et leurs bloqueurs. MÊME logique que checkInterval().
 *
 * @param {object} ctx données (voir loadAvailabilityData)
 * @param {{ startDateIso: string, days: number }} range dates calendaires
 */
export function computeSlots(ctx, range) {
  const slots = new Map();
  for (let i = 0; i <= range.days; i++) {
    const dateIso = addDaysIso(range.startDateIso, i);
    for (const window of windowsForDate(dateIso, ctx)) {
      for (let cursor = window.startMin; cursor + SLOT_MINUTES <= window.endMin; cursor += SLOT_MINUTES) {
        // Nuit du passage à l'heure d'été : l'heure n'existe pas → ignorée
        // (sinon affichée puis refusée à la réservation).
        const startUtc = wallTimeToUtc(dateIso, cursor, window.zone);
        if (!startUtc) continue;
        const endUtc = new Date(startUtc.getTime() + SLOT_MINUTES * MINUTE_MS);
        const key = startUtc.toISOString();
        if (slots.has(key)) continue;
        slots.set(key, { start: startUtc, end: endUtc, activeLocation: window.location, dateIso });
      }
    }
  }

  const ordered = Array.from(slots.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
  if (ordered.length === 0) return [];

  // Bloqueurs préparés UNE fois sur toute la fenêtre, puis indexés par jour
  // de Bruxelles (un élément qui couvre plusieurs jours est indexé sous
  // chacun) : chaque créneau ne consulte que les éléments de son jour.
  const rangeStart = ordered[0].start;
  const rangeEnd = ordered[ordered.length - 1].end;
  const items = prepareBlockers(ctx, rangeStart, rangeEnd);
  const byDay = new Map();
  for (const item of items) {
    let iso = isoDateInZone(new Date(item.startMs), BRUSSELS_TZ);
    const lastIso = isoDateInZone(new Date(Math.max(item.startMs, item.endMs - 1)), BRUSSELS_TZ);
    for (let i = 0; iso <= lastIso && i < 370; i++, iso = addDaysIso(iso, 1)) {
      if (!byDay.has(iso)) byDay.set(iso, []);
      byDay.get(iso).push(item);
    }
  }

  return ordered.map((slot) => {
    const startMs = slot.start.getTime();
    const endMs = slot.end.getTime();
    const dayKey = isoDateInZone(slot.start, BRUSSELS_TZ);
    const lastKey = isoDateInZone(new Date(endMs - 1), BRUSSELS_TZ);
    const candidates =
      dayKey === lastKey
        ? byDay.get(dayKey) ?? []
        : Array.from(new Set([...(byDay.get(dayKey) ?? []), ...(byDay.get(lastKey) ?? [])]));
    const blockers = blockersFromItems(candidates, startMs, endMs);
    return { ...slot, status: statusFromBlockers(blockers), blockers };
  });
}

/** Dates calendaires dont les fenêtres peuvent contenir un intervalle. */
function candidateDates(startUtc) {
  const brussels = isoDateInZone(startUtc, BRUSSELS_TZ);
  const miami = isoDateInZone(startUtc, MIAMI_TZ);
  return Array.from(new Set([brussels, miami, addDaysIso(brussels, -1)]));
}

/** L'intervalle est-il entièrement dans une fenêtre de disponibilité ? */
export function isWithinAvailability(startUtc, endUtc, ctx) {
  for (const dateIso of candidateDates(startUtc)) {
    for (const window of windowsForDate(dateIso, ctx)) {
      if (window.startUtc.getTime() <= startUtc.getTime() && endUtc.getTime() <= window.endUtc.getTime()) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Vérification serveur d'un intervalle (réservation, reprogrammation).
 * @returns {{ ok: true } | { ok: false, code: "INVALID" | "OUTSIDE_AVAILABILITY" | "TAKEN" | "BLOCKED", error: string, blockers?: object[] }}
 */
export function checkInterval(startUtc, endUtc, ctx, options = {}) {
  if (!(startUtc instanceof Date) || !(endUtc instanceof Date) || endUtc.getTime() <= startUtc.getTime()) {
    return { ok: false, code: "INVALID", error: "Créneau invalide." };
  }
  // Un créneau qui chevauche minuit (heure de Bruxelles) reste refusé, sauf
  // s'il finit pile à minuit (comportement historique conservé).
  const startDay = isoDateInZone(startUtc, BRUSSELS_TZ);
  const endLocal = DateTime.fromJSDate(endUtc, { zone: "utc" }).setZone(BRUSSELS_TZ);
  const endsAtMidnight = endLocal.hour === 0 && endLocal.minute === 0 && endLocal.toISODate() === addDaysIso(startDay, 1);
  if (endLocal.toISODate() !== startDay && !endsAtMidnight) {
    return { ok: false, code: "INVALID", error: "Créneau invalide." };
  }

  if (!isWithinAvailability(startUtc, endUtc, ctx)) {
    return { ok: false, code: "OUTSIDE_AVAILABILITY", error: "Créneau hors disponibilités." };
  }
  const blockers = findBlockers(startUtc, endUtc, ctx, options);
  if (blockers.some((b) => b.kind === "booking")) {
    return { ok: false, code: "TAKEN", error: "Ce créneau vient d'être pris.", blockers };
  }
  if (blockers.length > 0) {
    return { ok: false, code: "BLOCKED", error: "Ce créneau est bloqué.", blockers };
  }
  return { ok: true };
}

/**
 * Plages "HH:mm" (heure de Bruxelles) de tout ce qui existe déjà sur une date
 * de Bruxelles : créneaux générés (tous statuts) + réservations, arrondis à
 * l'heure. Sert à fusionner une ouverture ajoutée SANS effacer le reste du
 * jour (une exception OPEN remplace les horaires habituels du jour).
 */
export function existingRangesForBrusselsDate(dateIso, ctx) {
  const ranges = [];
  const from = addDaysIso(dateIso, -1);
  for (const slot of computeSlots(ctx, { startDateIso: from, days: 2 })) {
    if (isoDateInZone(slot.start, BRUSSELS_TZ) !== dateIso) continue;
    const s = DateTime.fromJSDate(slot.start, { zone: "utc" }).setZone(BRUSSELS_TZ);
    const e = DateTime.fromJSDate(slot.end, { zone: "utc" }).setZone(BRUSSELS_TZ);
    ranges.push({ startTime: s.toFormat("HH:mm"), endTime: e.hour === 0 && e.minute === 0 ? "24:00" : e.toFormat("HH:mm") });
  }
  for (const booking of ctx.bookings ?? []) {
    if (isoDateInZone(new Date(booking.startAt), BRUSSELS_TZ) !== dateIso) continue;
    const s = DateTime.fromJSDate(new Date(booking.startAt), { zone: "utc" }).setZone(BRUSSELS_TZ).startOf("hour");
    let e = DateTime.fromJSDate(new Date(booking.endAt), { zone: "utc" }).setZone(BRUSSELS_TZ);
    if (e.minute > 0 || e.second > 0) e = e.startOf("hour").plus({ hours: 1 });
    const endTime = e.toISODate() !== dateIso ? "24:00" : e.toFormat("HH:mm");
    ranges.push({ startTime: s.toFormat("HH:mm"), endTime });
  }
  return ranges;
}
