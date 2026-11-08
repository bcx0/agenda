import { Resend } from 'resend'
import { prisma } from './prisma'
import { decideSyncAlert } from './alerting.mjs'

// Alertes envoyées à l'admin (ADMIN_ALERT_EMAIL). Tant que le domaine n'est
// pas vérifié chez Resend, seul l'email du propriétaire du compte Resend
// peut recevoir : c'est donc l'adresse à mettre dans ADMIN_ALERT_EMAIL.
//
// Les traces vont en SyncLog avec direction 'system' : elles n'interfèrent
// pas avec la santé Google (lib/google-health.ts filtre google_to_app /
// app_to_google).

export interface AdminEmailAttachment {
  filename: string
  content: Buffer
}

export async function sendAdminEmail(
  subject: string,
  html: string,
  attachments: AdminEmailAttachment[] = []
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  const to = process.env.ADMIN_ALERT_EMAIL
  if (!apiKey || !from || !to) {
    return { ok: false, error: 'ADMIN_ALERT_EMAIL, RESEND_API_KEY ou EMAIL_FROM manquant' }
  }
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from,
      to,
      subject: `[Agenda] ${subject}`,
      html,
      attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })),
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function logSystemEvent(
  action: string,
  details: Record<string, string | number | boolean | null>
): Promise<void> {
  await prisma.syncLog
    .create({ data: { table: 'System', action, direction: 'system', details } })
    .catch((e: unknown) => console.error('[Alerts] Failed to log', action, e))
}

async function lastAt(where: { action: string | { in: string[] }; table?: string }): Promise<number | null> {
  const row = await prisma.syncLog.findFirst({
    where,
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  return row ? row.createdAt.getTime() : null
}

/**
 * À appeler à chaque passage du cron de sync (succès ou échec) et par la
 * maintenance quotidienne. Envoie « sync en panne » après 30 min sans
 * sync_ok (rappel toutes les 12 h), puis « sync rétablie ». Ne lève jamais.
 */
export async function checkSyncAlerts(reason?: string): Promise<void> {
  try {
    const now = Date.now()
    const [lastOkAt, lastAlertAt, lastRecoveryAt] = await Promise.all([
      lastAt({ table: 'GoogleToken', action: 'sync_ok' }),
      lastAt({ action: 'alert_sync_down' }),
      lastAt({ action: 'alert_sync_recovered' }),
    ])
    const decision = decideSyncAlert({ now, lastOkAt, lastAlertAt, lastRecoveryAt })
    if (!decision) return

    const since = lastOkAt ? new Date(lastOkAt).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels' }) : 'inconnue'
    if (decision === 'down') {
      const sent = await sendAdminEmail(
        'Synchronisation Google Calendar en panne',
        `<p>La synchronisation entre l'app et Google Calendar ne fonctionne plus.</p>
         <p>Dernière synchronisation réussie : <strong>${since}</strong> (heure de Bruxelles).</p>
         <p>Dernière erreur : ${escapeHtml(reason ?? 'voir SyncLog')}</p>
         <p>Les réservations restent enregistrées dans l'app ; elles seront envoyées vers Google dès le retour de la synchronisation.</p>`
      )
      await logSystemEvent('alert_sync_down', { sent: sent.ok, error: sent.error ?? null, reason: reason ?? null })
    } else {
      const sent = await sendAdminEmail(
        'Synchronisation Google Calendar rétablie',
        `<p>La synchronisation fonctionne de nouveau (dernier succès : ${since}).</p>`
      )
      await logSystemEvent('alert_sync_recovered', { sent: sent.ok, error: sent.error ?? null })
    }
  } catch (err: unknown) {
    console.error('[Alerts] checkSyncAlerts failed:', err)
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
