type MakeBookingWebhookPayload = {
  clientName: string;
  service: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
};

function toDatePart(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toTimePart(value: Date) {
  return value.toISOString().slice(11, 16);
}

export function makePayloadFromBooking(input: {
  clientName: string;
  service?: string | null;
  startAt: Date;
  endAt: Date;
  notes?: string | null;
}): MakeBookingWebhookPayload {
  return {
    clientName: input.clientName,
    service: input.service ?? "Rendez-vous",
    date: toDatePart(input.startAt),
    startTime: toTimePart(input.startAt),
    endTime: toTimePart(input.endAt),
    notes: input.notes ?? ""
  };
}

export async function sendMakeBookingWebhook(payload: MakeBookingWebhookPayload) {
  try {
    const url = process.env.MAKE_WEBHOOK_URL;
    if (!url) return;

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    // Intentionally swallow errors to keep primary booking flow unaffected.
  }
}
