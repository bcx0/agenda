/**
 * Événements fantômes et doublons dans Google Calendar (26/11/2026).
 *
 * Problème corrigé : un rendez-vous annulé dans l'app restait dans Google
 * Calendar (cas signalé : RDV annulé par le client depuis son espace, toujours
 * visible chez Geoffrey à côté du RDV valide d'un autre client sur le même
 * créneau). Trois mécanismes y menaient :
 *  1. la création Google n'était pas attendue à la réservation : la fonction
 *     pouvait être coupée après la création de l'événement mais avant
 *     l'enregistrement de son identifiant. À l'annulation, l'app ne
 *     connaissait aucun identifiant et ne supprimait rien ;
 *  2. le cron voyait la même réservation « sans événement » et en créait un
 *     second (doublon) : seul l'un des deux était supprimé à l'annulation ;
 *  3. quand l'événement resté vivant revenait par la synchro, l'app le
 *     rattachait à la réservation annulée et le marquait « synchronisé » au
 *     lieu de le supprimer.
 *
 * Ce module est PUR (aucune base, aucun réseau) : il décide, à partir d'un
 * listing Google et des réservations concernées, quels événements supprimer
 * et quelles réservations rattacher. Règles de sécurité :
 *  - un événement n'est JAMAIS désigné par son seul horaire : il faut soit
 *    l'identifiant Google enregistré sur la réservation, soit l'étiquette
 *    privée posée par l'app (recordId) confirmée par la date de création ET
 *    l'horaire ;
 *  - un événement lié à une réservation confirmée ou à un bloc n'est jamais
 *    supprimé ;
 *  - une annulation venue de Google (motif « … Google Calendar ») n'est pas
 *    concernée : si l'événement revit côté Google, la réservation est
 *    restaurée (comportement existant) ;
 *  - au-delà d'un plafond d'actions, rien n'est appliqué (listing ou base
 *    suspects) : l'anomalie est journalisée pour vérification humaine.
 */

/** Marge entre la création de la réservation et celle de son événement. */
export const CREATED_TOLERANCE_MS = 60 * 1000;
/** Deux horaires sont « identiques » à moins d'une minute près. */
const SAME_TIME_MS = 60 * 1000;
/** Plafond d'actions par balayage : au-delà, rien n'est appliqué. */
export const GHOST_SWEEP_MAX_ACTIONS = 25;
/** Les événements passés depuis plus de 24 h ne sont pas touchés. */
export const GHOST_PAST_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Réservation annulée DANS l'app (client, admin, série) : son événement Google
 * ne doit plus exister. Les annulations venues de Google portent un motif
 * contenant « Google Calendar » et suivent la logique de restauration.
 */
export function isAppCancelled(booking) {
  if (!booking || booking.status !== "CANCELLED") return false;
  return !String(booking.cancelReason ?? "").includes("Google Calendar");
}

function eventStartMs(event) {
  const value = Date.parse(event?.start?.dateTime ?? "");
  return Number.isFinite(value) ? value : null;
}

function taggedBookingId(event, appSource) {
  const tag = event?.extendedProperties?.private;
  if (!tag || tag.appSource !== appSource || tag.recordType !== "booking") return null;
  const id = Number(tag.recordId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * L'événement appartient-il de façon CERTAINE à cette réservation ?
 *  - "linked" : c'est l'identifiant Google enregistré sur la réservation ;
 *  - "tagged" : l'étiquette de l'app désigne cette réservation, l'événement a
 *    été créé après elle et porte exactement son horaire (un événement d'une
 *    ancienne base, ou une copie faite à la main dans Google à un autre
 *    horaire, ne passe pas) ;
 *  - null : aucune certitude, on ne touche à rien.
 *
 * @returns {"linked" | "tagged" | null}
 */
export function eventOwnership(booking, event, appSource) {
  if (!booking || !event?.id) return null;
  if (booking.googleEventId && booking.googleEventId === event.id) return "linked";
  if (taggedBookingId(event, appSource) !== booking.id) return null;
  const created = Date.parse(event.created ?? "");
  const bookingCreated = booking.createdAt ? new Date(booking.createdAt).getTime() : NaN;
  if (!Number.isFinite(created) || !Number.isFinite(bookingCreated)) return null;
  if (created < bookingCreated - CREATED_TOLERANCE_MS) return null;
  const start = eventStartMs(event);
  const bookingStart = booking.startAt ? new Date(booking.startAt).getTime() : NaN;
  if (start === null || !Number.isFinite(bookingStart)) return null;
  if (Math.abs(start - bookingStart) >= SAME_TIME_MS) return null;
  return "tagged";
}

/** L'événement est-il dans la fenêtre où l'app a le droit d'agir ? */
export function isWithinGhostScope(event, now = new Date()) {
  const start = eventStartMs(event);
  return start !== null && start >= now.getTime() - GHOST_PAST_GRACE_MS;
}

/**
 * Plan de nettoyage à partir d'un listing COMPLET.
 *
 * @param {{
 *   events: object[],
 *   bookings: { id: number, status: string, cancelReason?: string | null,
 *     googleEventId?: string | null, createdAt: Date | string, startAt: Date | string }[],
 *   blockEventIds?: Iterable<string>,
 *   appSource: string,
 *   now?: Date,
 *   maxActions?: number
 * }} input
 * @returns {{
 *   deletions: { eventId: string, bookingId: number, reason: string, summary: string | null, start: string | null }[],
 *   relinks: { bookingId: number, eventId: string, etag: string | null, restore: boolean }[],
 *   uncertain: { eventId: string, bookingId: number, summary: string | null, start: string | null }[],
 *   aborted: string | null
 * }}
 */
export function planGhostSweep(input) {
  const { events, bookings, appSource } = input;
  const now = input.now ?? new Date();
  const maxActions = input.maxActions ?? GHOST_SWEEP_MAX_ACTIONS;
  const blockEventIds = new Set(input.blockEventIds ?? []);

  const live = (events ?? []).filter((e) => e && e.id && e.status !== "cancelled");
  const liveIds = new Set(live.map((e) => e.id));
  const bookingById = new Map();
  const bookingByEventId = new Map();
  for (const booking of bookings ?? []) {
    bookingById.set(booking.id, booking);
    if (booking.googleEventId) bookingByEventId.set(booking.googleEventId, booking);
  }

  const plan = { deletions: [], relinks: [], uncertain: [], aborted: null };
  const relinked = new Set();
  const describe = (event) => ({ summary: event.summary ?? null, start: event.start?.dateTime ?? null });

  for (const event of live) {
    if (!isWithinGhostScope(event, now)) continue;

    // 1. Événement désigné par l'identifiant enregistré sur une réservation.
    const linked = bookingByEventId.get(event.id);
    if (linked) {
      if (isAppCancelled(linked)) {
        plan.deletions.push({ eventId: event.id, bookingId: linked.id, reason: "cancelled_booking", ...describe(event) });
      }
      continue;
    }
    // 2. Événement lié à un bloc : jamais concerné.
    if (blockEventIds.has(event.id)) continue;

    // 3. Événement seulement étiqueté par l'app.
    const taggedId = taggedBookingId(event, appSource);
    if (taggedId === null) continue; // événement indépendant de l'app
    const booking = bookingById.get(taggedId);
    if (!booking) continue; // enregistrement purgé : traité par l'import
    if (eventOwnership(booking, event, appSource) !== "tagged") {
      if (isAppCancelled(booking)) {
        plan.uncertain.push({ eventId: event.id, bookingId: booking.id, ...describe(event) });
      }
      continue;
    }
    if (isAppCancelled(booking)) {
      plan.deletions.push({ eventId: event.id, bookingId: booking.id, reason: "cancelled_booking_unlinked_event", ...describe(event) });
      continue;
    }
    const canonicalAlive = !!booking.googleEventId && liveIds.has(booking.googleEventId);
    if (booking.status === "CANCELLED") {
      // Annulée PAR la synchro parce que son événement enregistré a disparu
      // de Google, alors qu'un autre événement certain de la même réservation
      // y vit toujours (un doublon supprimé à la main, par exemple) : le RDV
      // existe encore chez Geoffrey, on le restaure sur cet événement.
      if (!canonicalAlive && !relinked.has(booking.id)) {
        relinked.add(booking.id);
        plan.relinks.push({ bookingId: booking.id, eventId: event.id, etag: event.etag ?? null, restore: true });
      }
      continue;
    }
    if (booking.status !== "CONFIRMED") continue;
    if (canonicalAlive || relinked.has(booking.id)) {
      plan.deletions.push({ eventId: event.id, bookingId: booking.id, reason: "duplicate_event", ...describe(event) });
      continue;
    }
    // Réservation confirmée dont l'événement enregistré n'existe pas (ou
    // n'a jamais été enregistré) : on la rattache à son événement réel.
    relinked.add(booking.id);
    plan.relinks.push({ bookingId: booking.id, eventId: event.id, etag: event.etag ?? null, restore: false });
  }

  if (plan.deletions.length > maxActions) {
    plan.aborted = "too_many_deletions";
  }
  return plan;
}
