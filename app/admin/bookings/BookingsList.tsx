"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { adminRescheduleBookingAction, cancelBookingAction } from "../actions";
import { useLanguage } from "../../../components/LanguageProvider";

type BookingItem = {
  id: number;
  startAt: string;
  status: string;
  mode: string;
  cancelReason: string | null;
  googleEventId: string | null;
  client: { id: number; name: string; email: string };
};

type Props = {
  bookings: BookingItem[];
  errorMessage?: string;
};

export default function BookingsList({ bookings, errorMessage }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const { t, translateStatus, translateMode } = useLanguage();

  const filteredBookings = useMemo(() => {
    if (!searchQuery.trim()) return bookings;
    const query = searchQuery.trim().toLowerCase();
    return bookings.filter(
      (b) =>
        b.client.name.toLowerCase().includes(query) ||
        b.client.email.toLowerCase().includes(query)
    );
  }, [bookings, searchQuery]);

  return (
    <>
      {errorMessage && <div className="alert-error">{errorMessage}</div>}

      {/* Search bar */}
      <div className="card p-4">
        <input
          type="text"
          placeholder={t("bookings.search")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input w-full p-4 text-base"
        />
        {searchQuery.trim() && (
          <p className="mt-2 text-xs text-white/50">
            {filteredBookings.length} {t("bookings.results")}{filteredBookings.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {filteredBookings.length === 0 ? (
        <p className="text-white/50">
          {searchQuery.trim() ? t("bookings.noResults") : t("bookings.noBookings")}
        </p>
      ) : null}

      {/* Mobile */}
      <div className="space-y-4 md:hidden">
        {filteredBookings.map((booking) => (
          <article key={booking.id} className="card p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold">{booking.client.name}</h3>
                <p className="mt-1 truncate text-sm text-white/60">{booking.client.email}</p>
                <p className="mt-2 text-sm font-medium text-white/80">
                  {new Date(booking.startAt).toLocaleDateString("fr-FR", {
                    weekday: "short",
                    day: "numeric",
                    month: "short"
                  })}
                  {" à "}
                  {new Date(booking.startAt).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span
                  className={
                    booking.status === "CONFIRMED"
                      ? "status-confirmed"
                      : booking.status === "CANCELLED"
                      ? "status-cancelled"
                      : booking.status === "NO_SHOW"
                      ? "status-noshow"
                      : "status-done"
                  }
                >
                  {translateStatus(booking.status)}
                </span>
                {booking.googleEventId ? (
                  <span className="pill text-[11px]">via Google</span>
                ) : null}
              </div>
            </div>
            <Link
              href={`/admin/bookings/${booking.id}`}
              className="btn-secondary touch-target block w-full text-center"
            >
              {t("bookings.viewDetails")}
            </Link>
          </article>
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden space-y-4 md:block">
        {filteredBookings.map((booking) => (
          <div key={booking.id} className="card-gm">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{booking.client.name}</p>
                <p className="text-sm text-white/70">{booking.client.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={
                    booking.status === "CONFIRMED"
                      ? "status-confirmed"
                      : booking.status === "CANCELLED"
                      ? "status-cancelled"
                      : booking.status === "NO_SHOW"
                      ? "status-noshow"
                      : "status-done"
                  }
                >
                  {translateStatus(booking.status)}
                </span>
                {booking.googleEventId ? (
                  <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-white">
                    via Google
                  </span>
                ) : null}
              </div>
            </div>

            <div className="space-y-1 text-sm">
              <p>
                <strong>Date :</strong>{" "}
                {new Date(booking.startAt).toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                  year: "numeric"
                })}{" "}
                à{" "}
                {new Date(booking.startAt).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit"
                })}{" "}
                Belgique
              </p>
              <p>
                <strong>Mode :</strong> {translateMode(booking.mode)}
              </p>
              {booking.cancelReason && (
                <p>
                  <strong>Raison annulation :</strong> {booking.cancelReason}
                </p>
              )}
            </div>

            {booking.status === "CONFIRMED" ? (
              <div className="grid gap-2 pt-2 md:grid-cols-[1fr_auto] md:items-end">
                <form action={adminRescheduleBookingAction} className="grid gap-2 md:grid-cols-3">
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <input type="datetime-local" name="start" className="input" required />
                  <input
                    type="text"
                    name="reason"
                    placeholder={t("bookings.reason")}
                    className="input md:col-span-2"
                  />
                  <button type="submit" className="btn-secondary touch-target text-sm md:col-span-3">
                    {t("bookings.modify")}
                  </button>
                </form>
                <form action={cancelBookingAction}>
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <button type="submit" className="btn-danger touch-target w-full text-sm">
                    {t("bookings.cancel")}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
