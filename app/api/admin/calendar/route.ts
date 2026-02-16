import { NextResponse } from "next/server";
import ical from "ical-generator";
import { createClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AppointmentRow = {
  id: number;
  date: string;
  client_name: string | null;
  service: string | null;
  notes: string | null;
  location: string | null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (token !== process.env.ADMIN_CALENDAR_TOKEN) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = await createClient();

  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("id,date,client_name,service,notes,location")
    .order("date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch appointments." }, { status: 500 });
  }

  const calendar = ical({ name: "Agenda Geoffrey Mahieu" });

  (appointments as AppointmentRow[] | null)?.forEach((apt) => {
    const start = new Date(apt.date);
    if (Number.isNaN(start.getTime())) return;

    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const summary = [apt.client_name, apt.service].filter(Boolean).join(" - ") || "Rendez-vous";

    calendar.createEvent({
      start,
      end,
      summary,
      description: apt.notes || "",
      location: apt.location || "Cabinet"
    });
  });

  return new NextResponse(calendar.toString(), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="agenda.ics"'
    }
  });
}

