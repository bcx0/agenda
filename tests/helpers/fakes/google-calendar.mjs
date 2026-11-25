/**
 * Google Calendar en mémoire (doublure de lib/google-calendar.ts).
 * Reproduit ce dont dépend la synchronisation : identifiants stables, etag
 * changé à chaque écriture, horodatage `updated`, événements supprimés
 * conservés avec status "cancelled", jeton de synchro incrémental.
 * `fake` permet aux tests de modifier un événement « depuis Google » et de
 * provoquer des pannes.
 */

export const GoogleCalendarEvent = undefined; // type seulement côté TS

const state = (globalThis.__FAKE_GOOGLE__ ??= {
  events: new Map(),
  seq: 0,
  nextId: 1,
  calls: [],
  failures: [] // { op, count }
});

function maybeFail(op) {
  const failure = state.failures.find((f) => f.op === op && f.count > 0);
  if (failure) {
    failure.count--;
    throw new Error(`Google ${op} failed: 503 (simulé)`);
  }
}

function stamp(event) {
  state.seq++;
  event.etag = `"etag-${event.id}-${state.seq}"`;
  event.updated = new Date(Date.now() + state.seq).toISOString();
  event._seq = state.seq;
  return event;
}

function publicCopy(event) {
  const { _seq, ...rest } = event;
  return JSON.parse(JSON.stringify(rest));
}

export async function createGoogleEvent(payload) {
  state.calls.push({ op: "create", payload });
  maybeFail("create");
  const id = `evt${state.nextId++}`;
  const event = stamp({ id, status: "confirmed", ...JSON.parse(JSON.stringify(payload)) });
  state.events.set(id, event);
  return publicCopy(event);
}

export async function updateGoogleEvent(id, payload) {
  state.calls.push({ op: "update", id, payload });
  maybeFail("update");
  const event = state.events.get(id);
  if (!event || event.status === "cancelled") throw new Error(`Google updateGoogleEvent failed: 404`);
  Object.assign(event, JSON.parse(JSON.stringify(payload)));
  stamp(event);
  return publicCopy(event);
}

export async function deleteGoogleEvent(id) {
  state.calls.push({ op: "delete", id });
  maybeFail("delete");
  const event = state.events.get(id);
  if (!event) return;
  event.status = "cancelled";
  stamp(event);
}

export async function findAppEventByRecord(appSource, recordType, recordId) {
  state.calls.push({ op: "find", recordType, recordId });
  maybeFail("find");
  for (const event of state.events.values()) {
    const p = event.extendedProperties?.private;
    if (
      event.status !== "cancelled" &&
      p?.appSource === appSource &&
      p?.recordType === recordType &&
      p?.recordId === String(recordId)
    ) {
      return publicCopy(event);
    }
  }
  return null;
}

export async function fetchChangedEvents(syncToken) {
  state.calls.push({ op: "list", syncToken });
  maybeFail("list");
  const since = syncToken ? Number(String(syncToken).replace("tok", "")) : 0;
  const items = [...state.events.values()].filter((e) => e._seq > since).map(publicCopy);
  return { items, nextSyncToken: `tok${state.seq}`, fullSyncRequired: false };
}

export async function googleApiFetch() {
  throw new Error("googleApiFetch non disponible en test");
}
export async function getValidAccessToken() {
  return "test-token";
}

/** Outils de test. */
export const fake = {
  state,
  reset() {
    state.events.clear();
    state.seq = 0;
    state.nextId = 1;
    state.calls.length = 0;
    state.failures.length = 0;
  },
  /** Modification faite par Geoffrey directement dans Google Calendar. */
  editFromGoogle(id, patch) {
    const event = state.events.get(id);
    if (!event) throw new Error(`événement ${id} absent`);
    Object.assign(event, JSON.parse(JSON.stringify(patch)));
    stamp(event);
    return publicCopy(event);
  },
  /** Événement créé directement dans Google (pas par l'app). */
  addFromGoogle(payload) {
    const id = `gcal${state.nextId++}`;
    const event = stamp({ id, status: "confirmed", ...JSON.parse(JSON.stringify(payload)) });
    state.events.set(id, event);
    return publicCopy(event);
  },
  deleteFromGoogle(id) {
    const event = state.events.get(id);
    event.status = "cancelled";
    stamp(event);
  },
  failNext(op, count = 1) {
    state.failures.push({ op, count });
  },
  get(id) {
    const event = state.events.get(id);
    return event ? publicCopy(event) : null;
  },
  liveEvents() {
    return [...state.events.values()].filter((e) => e.status !== "cancelled").map(publicCopy);
  },
  /** Simule « l'événement a été créé chez Google mais la réponse est perdue ». */
  createSilently(payload) {
    const id = `evt${state.nextId++}`;
    const event = stamp({ id, status: "confirmed", ...JSON.parse(JSON.stringify(payload)) });
    state.events.set(id, event);
    return publicCopy(event);
  }
};
