import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { checkSyncAlerts, logSystemEvent, sendAdminEmail } from '../../../../lib/admin-alerts'
import { buildEncryptedBackup } from '../../../../lib/backup'
import { isBackupDue, shouldAlertStorage, DB_SIZE_ALERT_BYTES } from '../../../../lib/alerting.mjs'

// Maintenance quotidienne (vercel.json) :
// 1. alerte si la sync Google est en panne (filet si le cron de sync plante) ;
// 2. sauvegarde chiffrée hors Supabase, envoyée par email tous les 7 jours ;
// 3. alerte si la base approche la limite de stockage du plan.
// Chaque étape est isolée : l'échec de l'une n'empêche pas les autres.

export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function lastSystemEventAt(action: string): Promise<number | null> {
  const row = await prisma.syncLog.findFirst({
    where: { action },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  return row ? row.createdAt.getTime() : null
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const report: Record<string, string> = {}
  const now = Date.now()

  await checkSyncAlerts('contrôle de maintenance quotidien')
  report.syncAlerts = 'checked'

  try {
    if (isBackupDue({ now, lastBackupAt: await lastSystemEventAt('backup_sent') })) {
      const backup = await buildEncryptedBackup()
      const rows = Object.entries(backup.summary)
        .map(([t, n]) => `<li>${t} : ${n}</li>`)
        .join('')
      const sent = await sendAdminEmail(
        'Sauvegarde hebdomadaire',
        `<p>Sauvegarde chiffrée des données de l'agenda en pièce jointe (${Math.round(
          backup.content.length / 1024
        )} Ko).</p><ul>${rows}</ul>
         <p>À conserver. Restauration : voir scripts/restore-backup.mjs dans le dépôt
         (la clé BACKUP_ENCRYPTION_KEY est nécessaire).</p>`,
        [{ filename: backup.filename, content: backup.content }]
      )
      await logSystemEvent(sent.ok ? 'backup_sent' : 'backup_failed', {
        bytes: backup.content.length,
        bookings: backup.summary.Booking ?? 0,
        error: sent.error ?? null,
      })
      report.backup = sent.ok ? `sent (${backup.content.length} bytes)` : `failed: ${sent.error}`
    } else {
      report.backup = 'not due'
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    await logSystemEvent('backup_failed', { error: message })
    report.backup = `failed: ${message}`
  }

  try {
    const [{ size }] = await prisma.$queryRaw<Array<{ size: bigint }>>`SELECT pg_database_size(current_database()) AS size`
    const sizeBytes = Number(size)
    report.dbSizeMb = String(Math.round(sizeBytes / 1024 / 1024))
    if (shouldAlertStorage({ now, sizeBytes, lastStorageAlertAt: await lastSystemEventAt('alert_storage') })) {
      const sent = await sendAdminEmail(
        'Base de données presque pleine',
        `<p>La base occupe ${report.dbSizeMb} Mo (seuil d'alerte : ${Math.round(
          DB_SIZE_ALERT_BYTES / 1024 / 1024
        )} Mo, limite incluse au plan Supabase Pro : 8 Go).</p>
         <p>Le principal consommateur est le journal technique SyncLog : il peut être
         purgé des entrées anciennes sans toucher aux rendez-vous.</p>`
      )
      await logSystemEvent('alert_storage', { sizeBytes, sent: sent.ok })
    }
  } catch (err: unknown) {
    report.dbSize = `failed: ${err instanceof Error ? err.message : String(err)}`
  }

  return NextResponse.json({ ok: true, ...report })
}
