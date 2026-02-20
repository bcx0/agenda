import type { NextApiRequest, NextApiResponse } from 'next';
import ical from 'ical-generator';
import { createClient } from '@supabase/supabase-js';

type AppointmentRow = {
  id: number;
  date: string;
  client_name: string | null;
  service: string | null;
  notes: string | null;
  location: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { token } = req.query;

  if (token !== process.env.ADMIN_CALENDAR_TOKEN) {
    return res.status(401).send('Unauthorized');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id,date,client_name,service,notes,location')
    .order('date', { ascending: true });

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch appointments.' });
  }

  const calendar = ical({ name: 'Agenda Geoffrey Mahieu' });

  (appointments as AppointmentRow[] | null)?.forEach((apt) => {
    const start = new Date(apt.date);
    if (Number.isNaN(start.getTime())) return;

    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const summary = [apt.client_name, apt.service].filter(Boolean).join(' - ') || 'Rendez-vous';

    calendar.createEvent({
      start,
      end,
      summary,
      description: apt.notes || '',
      location: apt.location || 'Cabinet'
    });
  });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="agenda.ics"');
  res.send(calendar.toString());
}
