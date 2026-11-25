"use client";

/**
 * Contrôles de l'agenda admin (25/11/2026) :
 *  - pourquoi un créneau est bloqué (réservation, récurrence, indisponibilité
 *    manuelle, événement Google) + l'action adaptée ;
 *  - libérer / rebloquer une occurrence précise ;
 *  - ajouter une disponibilité (y compris sur un créneau bloqué par une
 *    récurrence) ;
 *  - gérer une série : cette occurrence / cette occurrence et les suivantes /
 *    toute la série, et sa période de validité.
 * Chaque action affiche sa confirmation ou la raison exacte du refus.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { DateTime } from "luxon";
import type { SlotBlocker, SlotView } from "../../../lib/booking";
import { BRUSSELS_TZ, MIAMI_TZ } from "../../../lib/time";
import { SubmitButton } from "../../../components/SubmitButton";
import { useLanguage } from "../../../components/LanguageProvider";
import {
  addAvailabilitySlotAction,
  deleteOccurrenceAction,
  liftCalendarBlockAction,
  liftManualBlockAction,
  moveOccurrenceAction,
  releaseOccurrenceAction,
  restoreOccurrenceAction,
  setSeriesPeriodAction,
  type ScheduleActionState
} from "./schedule-actions";

type FormAction = (state: ScheduleActionState, formData: FormData) => Promise<ScheduleActionState>;

function ActionResult({ state }: { state: ScheduleActionState }) {
  if (!state) return null;
  return state.ok ? (
    <p role="status" className="text-xs text-green-400">✓ {state.message}</p>
  ) : (
    <p role="alert" className="text-xs text-red-400">✗ {state.error}</p>
  );
}

/** Petit formulaire « un bouton » avec champs cachés et retour inline. */
function InlineActionForm({
  action,
  fields,
  label,
  tone = "neutral",
  confirmText
}: {
  action: FormAction;
  fields: Record<string, string | number>;
  label: string;
  tone?: "neutral" | "danger" | "primary";
  confirmText?: string;
}) {
  const [state, formAction] = useFormState(action, null);
  const toneClass =
    tone === "danger"
      ? "border-red-500/40 text-red-300 hover:bg-red-500/10"
      : tone === "primary"
        ? "border-[#C8A060]/50 text-[#C8A060] hover:bg-[#C8A060]/10"
        : "border-white/20 text-white/80 hover:bg-white/5";
  return (
    <form
      action={formAction}
      className="space-y-1"
      onSubmit={(event) => {
        if (confirmText && !window.confirm(confirmText)) event.preventDefault();
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={String(value)} />
      ))}
      <SubmitButton className={`rounded-md border px-2.5 py-1 text-xs transition ${toneClass}`}>{label}</SubmitButton>
      <ActionResult state={state} />
    </form>
  );
}

const KIND_BADGE: Record<SlotBlocker["kind"], { fr: string; en: string; className: string }> = {
  booking: { fr: "Réservation", en: "Booking", className: "bg-green-500/15 text-green-300" },
  manual_block: { fr: "Indisponibilité manuelle", en: "Manual block", className: "bg-orange-500/15 text-orange-300" },
  calendar_block: { fr: "Calendrier", en: "Calendar", className: "bg-sky-500/15 text-sky-300" },
  recurring: { fr: "Récurrence", en: "Recurring", className: "bg-purple-500/15 text-purple-300" }
};

/**
 * Un créneau bloqué : TOUTES ses causes (par priorité) et l'action possible
 * pour chacune.
 */
export function BlockedSlotDetails({ slot, compact = false }: { slot: SlotView; compact?: boolean }) {
  const { locale } = useLanguage();
  const fr = locale === "fr";
  const blockers = slot.blockers ?? [];
  return (
    <div className={compact ? "text-sm" : "rounded-lg border border-white/10 bg-[#0F0F0F] px-3 py-2 text-sm"}>
      {compact ? null : (
        <p className="font-semibold text-white/85">
          {slot.brussels} Bruxelles · {slot.miami} Miami
        </p>
      )}
      {blockers.length === 0 ? (
        <p className="text-xs text-white/50">{slot.blockReason ?? (fr ? "Bloqué" : "Blocked")}</p>
      ) : (
        <ul className="mt-1 space-y-2">
          {blockers.map((blocker, index) => {
            const badge = KIND_BADGE[blocker.kind];
            return (
              <li key={`${blocker.kind}-${index}`} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}>
                    {fr ? badge.fr : badge.en}
                    {blocker.kind === "calendar_block" && blocker.fromGoogle ? " Google" : ""}
                  </span>
                  <span className="text-xs text-white/70">{blocker.label}</span>
                </div>
                <BlockerActions blocker={blocker} fr={fr} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function BlockerActions({ blocker, fr }: { blocker: SlotBlocker; fr: boolean }) {
  if (blocker.kind === "booking" && blocker.bookingId) {
    return (
      <Link href={`/admin/bookings/${blocker.bookingId}`} className="text-xs text-[#C8A060] hover:underline">
        {fr ? "Voir / déplacer le rendez-vous →" : "View / move booking →"}
      </Link>
    );
  }
  if (blocker.kind === "recurring" && blocker.recurringBlockId && blocker.occurrenceDate) {
    return (
      <div className="flex flex-wrap items-start gap-2">
        {!blocker.movedOccurrence ? (
          <InlineActionForm
            action={releaseOccurrenceAction}
            fields={{ recurringBlockId: blocker.recurringBlockId, occurrenceDate: blocker.occurrenceDate }}
            label={fr ? "Libérer cette date uniquement" : "Free this date only"}
            tone="primary"
          />
        ) : null}
        <Link
          href={`/admin/availability?tab=recurring#serie-${blocker.recurringBlockId}`}
          className="rounded-md border border-white/20 px-2.5 py-1 text-xs text-white/80 hover:bg-white/5"
        >
          {fr ? "Gérer la série" : "Manage series"}
        </Link>
      </div>
    );
  }
  if (blocker.kind === "manual_block" && blocker.overrideId) {
    return (
      <InlineActionForm
        action={liftManualBlockAction}
        fields={{ overrideId: blocker.overrideId }}
        label={fr ? "Lever cette indisponibilité" : "Lift this block"}
        tone="danger"
        confirmText={fr ? "Lever cette indisponibilité manuelle ?" : "Lift this manual block?"}
      />
    );
  }
  if (blocker.kind === "calendar_block" && blocker.blockId) {
    return (
      <div className="space-y-1">
        {blocker.fromGoogle ? (
          <p className="text-[11px] text-white/45">
            {fr
              ? "Vient de Google Calendar. Le lever le supprime aussi dans Google."
              : "Comes from Google Calendar. Lifting it also deletes it in Google."}
          </p>
        ) : null}
        <InlineActionForm
          action={liftCalendarBlockAction}
          fields={{ blockId: blocker.blockId }}
          label={fr ? "Lever ce blocage" : "Lift this block"}
          tone="danger"
          confirmText={
            blocker.fromGoogle
              ? fr
                ? "Supprimer aussi cet événement de Google Calendar ?"
                : "Also delete this event from Google Calendar?"
              : undefined
          }
        />
      </div>
    );
  }
  return null;
}

export type ReleasedOccurrence = {
  recurringBlockId: number;
  dateIso: string;
  start: string;
  end: string;
  label: string;
  reason: string | null;
  movedTo: { start: string; end: string } | null;
  dayKey: string;
};

/** Occurrences libérées ou déplacées du jour, avec « Rebloquer ». */
export function ReleasedOccurrencesList({ items }: { items: ReleasedOccurrence[] }) {
  const { locale } = useLanguage();
  const fr = locale === "fr";
  if (items.length === 0) return null;
  const hour = (iso: string, zone: string) => DateTime.fromISO(iso, { zone: "utc" }).setZone(zone).toFormat("HH:mm");
  const reasonLabel = (item: ReleasedOccurrence) => {
    if (item.movedTo) {
      const target = DateTime.fromISO(item.movedTo.start, { zone: "utc" }).setZone(BRUSSELS_TZ).setLocale(fr ? "fr" : "en");
      return `${fr ? "Déplacée au" : "Moved to"} ${target.toFormat("ccc dd LLL HH:mm")} (Bruxelles)`;
    }
    if (item.reason === "booking_cancelled") return fr ? "Rendez-vous annulé" : "Booking cancelled";
    return fr ? "Libérée pour cette date" : "Freed for this date";
  };
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold uppercase tracking-widest text-white/50">
        {fr ? "Occurrences libérées" : "Freed occurrences"}
      </h4>
      {items.map((item) => (
        <div key={`${item.recurringBlockId}-${item.dateIso}`} className="rounded-lg border border-purple-500/20 bg-[#0F0F0F] px-3 py-2 text-sm">
          <p className="font-semibold text-white/80">
            {hour(item.start, BRUSSELS_TZ)} Bruxelles · {hour(item.start, MIAMI_TZ)} Miami
          </p>
          <p className="text-xs text-white/60">{item.label}</p>
          <p className="text-xs text-purple-300/80">{reasonLabel(item)}</p>
          <div className="mt-1">
            <InlineActionForm
              action={restoreOccurrenceAction}
              fields={{ recurringBlockId: item.recurringBlockId, occurrenceDate: item.dateIso }}
              label={fr ? "Rebloquer cette date" : "Block this date again"}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

const HOUR_START_OPTIONS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
const HOUR_END_OPTIONS = Array.from({ length: 24 }, (_, h) => `${String(h + 1).padStart(2, "0")}:00`);

function plusOneHour(time: string): string {
  const hour = Number(time.split(":")[0]);
  return `${String(Math.min(hour + 1, 24)).padStart(2, "0")}:00`;
}

/**
 * « Ajouter un créneau » : rend la plage réellement réservable, y compris si
 * elle est bloquée par une récurrence (exception pour cette date). Refus
 * explicite si une réservation ou une indisponibilité explicite l'occupe.
 */
export function AddSlotForm({
  dayKey,
  isPast,
  hasOverrides
}: {
  dayKey: string;
  isPast: boolean;
  hasOverrides: boolean;
}) {
  const { t, locale } = useLanguage();
  const [state, formAction] = useFormState(addAvailabilitySlotAction, null);
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:00");
  const invalid = endTime <= startTime;
  const miamiPreview = useMemo(() => {
    const start = DateTime.fromISO(`${dayKey}T${startTime}`, { zone: BRUSSELS_TZ });
    return start.isValid ? start.setZone(MIAMI_TZ).toFormat("HH:mm") : "";
  }, [dayKey, startTime]);

  if (isPast) return null;

  return (
    <div className="space-y-3 rounded-xl border border-[#C8A060]/30 bg-[#0F0F0F] p-4">
      <h4 className="text-sm font-semibold uppercase tracking-widest text-primary">{t("availability.addSlotTitle")}</h4>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="date" value={dayKey} />
        <div className="space-y-1">
          <label className="block text-[11px] uppercase tracking-widest text-white/50">{t("availability.addSlotStart")}</label>
          <select
            name="startTime"
            className="input"
            value={startTime}
            onChange={(e) => {
              setStartTime(e.target.value);
              setEndTime(plusOneHour(e.target.value));
            }}
          >
            {HOUR_START_OPTIONS.map((time) => (
              <option key={`add-start-${time}`} value={time}>
                {time}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] uppercase tracking-widest text-white/50">{t("availability.addSlotEnd")}</label>
          <select name="endTime" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)}>
            {HOUR_END_OPTIONS.map((time) => (
              <option key={`add-end-${time}`} value={time}>
                {time}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton className="btn btn-primary" disabled={invalid}>
          {t("availability.addSlotSubmit")}
        </SubmitButton>
      </form>
      {miamiPreview ? (
        <p className="text-[11px] text-white/45">
          {locale === "fr" ? `Début ${startTime} Bruxelles = ${miamiPreview} Miami.` : `Start ${startTime} Brussels = ${miamiPreview} Miami.`}
        </p>
      ) : null}
      {invalid ? <p className="text-xs text-red-400">{t("availability.addSlotInvalid")}</p> : null}
      <ActionResult state={state} />
      {hasOverrides ? <p className="text-[11px] text-white/40">{t("availability.customDay")}</p> : null}
    </div>
  );
}

export type SeriesOccurrence = {
  dateIso: string;
  start: string;
  end: string;
  state: "active" | "booked" | "released" | "moved";
  reason: string | null;
  bookingId: number | null;
  movedTo: { start: string; end: string } | null;
};

export type SeriesSummary = {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timeZone: string;
  note: string | null;
  clientName: string | null;
  startDate: string | null;
  endDate: string | null;
  occurrences: SeriesOccurrence[];
};

const STATE_LABEL: Record<SeriesOccurrence["state"], { fr: string; en: string; className: string }> = {
  active: { fr: "Bloquée", en: "Blocked", className: "text-purple-300" },
  booked: { fr: "Réservée", en: "Booked", className: "text-green-300" },
  released: { fr: "Libérée", en: "Freed", className: "text-white/50" },
  moved: { fr: "Déplacée", en: "Moved", className: "text-sky-300" }
};

/**
 * Gestion d'une série : prochaines occurrences et leur état, modification
 * (cette occurrence / et les suivantes / toute la série), suppression et
 * période de validité.
 */
export function RecurringSeriesManager({ series }: { series: SeriesSummary }) {
  const { locale } = useLanguage();
  const fr = locale === "fr";
  const zoneLabel = series.timeZone === MIAMI_TZ ? "Miami" : "Bruxelles";
  const [moveState, moveAction] = useFormState(moveOccurrenceAction, null);
  const [deleteState, deleteAction] = useFormState(deleteOccurrenceAction, null);
  const [periodState, periodAction] = useFormState(setSeriesPeriodAction, null);
  const selectable = series.occurrences;
  const [occurrenceDate, setOccurrenceDate] = useState(selectable[0]?.dateIso ?? "");
  const [scope, setScope] = useState<"this" | "following" | "all">("this");
  const [newDate, setNewDate] = useState(selectable[0]?.dateIso ?? "");
  const [newStartTime, setNewStartTime] = useState(series.startTime);
  const [newEndTime, setNewEndTime] = useState(series.endTime);

  const fmtDate = (iso: string) => DateTime.fromISO(iso).setLocale(fr ? "fr" : "en").toFormat("ccc dd LLL yyyy");
  const hours = (iso: string) => {
    const d = DateTime.fromISO(iso, { zone: "utc" });
    return `${d.setZone(BRUSSELS_TZ).toFormat("HH:mm")} Bxl · ${d.setZone(MIAMI_TZ).toFormat("HH:mm")} Miami`;
  };

  return (
    <div id={`serie-${series.id}`} className="mt-3 space-y-4 rounded-xl border border-white/10 bg-[#0A0A0A] p-3">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-white/50">{fr ? "Prochaines occurrences" : "Upcoming occurrences"}</p>
        {selectable.length === 0 ? (
          <p className="text-xs text-white/50">{fr ? "Aucune occurrence à venir dans la période." : "No upcoming occurrence in the period."}</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {selectable.slice(0, 8).map((o) => {
              const st = STATE_LABEL[o.state];
              return (
                <li key={o.dateIso} className="text-xs text-white/70">
                  {fmtDate(o.dateIso)} · {hours(o.start)} · <span className={st.className}>{fr ? st.fr : st.en}</span>
                  {o.movedTo ? <span className="text-white/45"> → {DateTime.fromISO(o.movedTo.start, { zone: "utc" }).setZone(BRUSSELS_TZ).setLocale(fr ? "fr" : "en").toFormat("ccc dd LLL HH:mm")}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectable.length > 0 ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-[11px] uppercase tracking-widest text-white/50">
              <span>{fr ? "Occurrence" : "Occurrence"}</span>
              <select
                className="input"
                value={occurrenceDate}
                onChange={(e) => {
                  setOccurrenceDate(e.target.value);
                  setNewDate(e.target.value);
                }}
              >
                {selectable.map((o) => (
                  <option key={o.dateIso} value={o.dateIso}>
                    {fmtDate(o.dateIso)} — {fr ? STATE_LABEL[o.state].fr : STATE_LABEL[o.state].en}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="space-y-1 text-xs text-white/80">
              <legend className="text-[11px] uppercase tracking-widest text-white/50">{fr ? "Appliquer à" : "Apply to"}</legend>
              {(["this", "following", "all"] as const).map((value) => (
                <label key={value} className="flex items-center gap-2">
                  <input type="radio" name={`scope-${series.id}`} checked={scope === value} onChange={() => setScope(value)} />
                  {value === "this"
                    ? fr ? "Cette occurrence uniquement" : "This occurrence only"
                    : value === "following"
                      ? fr ? "Cette occurrence et les suivantes" : "This and following"
                      : fr ? "Toute la série" : "Entire series"}
                </label>
              ))}
            </fieldset>
          </div>

          <form action={moveAction} className="space-y-2 rounded-lg border border-white/10 p-3">
            <input type="hidden" name="recurringBlockId" value={series.id} />
            <input type="hidden" name="occurrenceDate" value={occurrenceDate} />
            <input type="hidden" name="scope" value={scope} />
            <input type="hidden" name="timeZone" value={series.timeZone} />
            <p className="text-xs font-semibold uppercase tracking-widest text-[#C8A060]">
              {fr ? `Déplacer / modifier (heures de ${zoneLabel})` : `Move / edit (${zoneLabel} time)`}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-[11px] text-white/50">
                <span className="block">{scope === "this" ? (fr ? "Nouvelle date" : "New date") : fr ? "Nouveau jour (date de référence)" : "New weekday (reference date)"}</span>
                <input type="date" name="newDate" className="input" value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
              </label>
              <label className="space-y-1 text-[11px] text-white/50">
                <span className="block">{fr ? "Début" : "Start"}</span>
                <input type="time" step={1800} name="newStartTime" className="input" value={newStartTime} onChange={(e) => setNewStartTime(e.target.value)} required />
              </label>
              <label className="space-y-1 text-[11px] text-white/50">
                <span className="block">{fr ? "Fin" : "End"}</span>
                <input type="time" step={1800} name="newEndTime" className="input" value={newEndTime} onChange={(e) => setNewEndTime(e.target.value)} required />
              </label>
            </div>
            {scope === "this" ? (
              <label className="flex items-center gap-2 text-xs text-white/70">
                <input type="checkbox" name="keepOriginalBlocked" />
                {fr ? "Garder l'ancien créneau bloqué (sinon il est libéré)" : "Keep the old slot blocked (otherwise it is freed)"}
              </label>
            ) : (
              <p className="text-[11px] text-white/45">
                {fr
                  ? "Le jour de la semaine est celui de la date choisie. Les rendez-vous réservés de la série suivent le nouvel horaire (refus si l'un tombe sur une autre réservation)."
                  : "The weekday is taken from the chosen date. Booked appointments of the series follow the new time (refused if one would hit another booking)."}
              </p>
            )}
            <SubmitButton className="btn btn-primary">{fr ? "Enregistrer le déplacement" : "Save the change"}</SubmitButton>
            <ActionResult state={moveState} />
          </form>

          <form
            action={deleteAction}
            className="space-y-2 rounded-lg border border-red-500/20 p-3"
            onSubmit={(event) => {
              const text =
                scope === "this"
                  ? fr ? "Supprimer cette occurrence ? (un rendez-vous lié sera annulé)" : "Delete this occurrence? (a linked booking will be cancelled)"
                  : scope === "following"
                    ? fr ? "Arrêter la série à partir de cette date ? (les rendez-vous suivants seront annulés)" : "Stop the series from this date? (following bookings will be cancelled)"
                    : fr ? "Supprimer toute la série ? (les rendez-vous à venir seront annulés)" : "Delete the whole series? (upcoming bookings will be cancelled)";
              if (!window.confirm(text)) event.preventDefault();
            }}
          >
            <input type="hidden" name="recurringBlockId" value={series.id} />
            <input type="hidden" name="occurrenceDate" value={occurrenceDate} />
            <input type="hidden" name="scope" value={scope} />
            <SubmitButton className="rounded-md border border-red-500/40 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10">
              {scope === "this"
                ? fr ? "Supprimer cette occurrence" : "Delete this occurrence"
                : scope === "following"
                  ? fr ? "Supprimer cette occurrence et les suivantes" : "Delete this and following"
                  : fr ? "Supprimer toute la série" : "Delete entire series"}
            </SubmitButton>
            <ActionResult state={deleteState} />
          </form>
        </div>
      ) : null}

      <form action={periodAction} className="space-y-2 rounded-lg border border-white/10 p-3">
        <input type="hidden" name="recurringBlockId" value={series.id} />
        <p className="text-xs font-semibold uppercase tracking-widest text-white/60">
          {fr ? "Période de la série (dates incluses, vide = sans limite)" : "Series period (inclusive, empty = unlimited)"}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-[11px] text-white/50">
            <span className="block">{fr ? "Du" : "From"}</span>
            <input type="date" name="startDate" className="input" defaultValue={series.startDate ?? ""} />
          </label>
          <label className="space-y-1 text-[11px] text-white/50">
            <span className="block">{fr ? "Au" : "To"}</span>
            <input type="date" name="endDate" className="input" defaultValue={series.endDate ?? ""} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input type="checkbox" name="cancelOutside" />
          {fr ? "Annuler aussi les rendez-vous réservés hors de cette période" : "Also cancel booked appointments outside this period"}
        </label>
        <SubmitButton className="btn btn-primary">{fr ? "Enregistrer la période" : "Save period"}</SubmitButton>
        <ActionResult state={periodState} />
      </form>
    </div>
  );
}
