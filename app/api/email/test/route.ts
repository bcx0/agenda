import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const TO_EMAIL = 'battiste.crevieaux@icloud.com';

export async function GET() {
  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;
  const appUrl = process.env.APP_URL;

  if (!apiKey || !emailFrom || !appUrl) {
    return NextResponse.json(
      { ok: false, error: 'Missing RESEND_API_KEY, EMAIL_FROM, or APP_URL.' },
      { status: 500 }
    );
  }

  try {
    const resend = new Resend(apiKey);

    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: TO_EMAIL,
      subject: '✅ Test email Agenda (Resend)',
      html: `
        <h1>Test OK</h1>
        <p>Resend fonctionne correctement.</p>
        <p><a href="${appUrl}/admin">Aller à l'administration</a></p>
      `,
    });

    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
