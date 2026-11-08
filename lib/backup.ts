import { prisma } from './prisma'
import { BACKUP_TABLES, encodeBackup, summarizeBackup } from './backup-format.mjs'

type Row = Record<string, unknown>

/**
 * Export des données métier, table par table, en lecture seule.
 * SELECT * brut : les noms de colonnes sont ceux de la base (ex. booked_by),
 * exactement ce qu'attend le SQL de restauration.
 */
export async function exportBusinessData(): Promise<{ exportedAt: string; tables: Record<string, Row[]> }> {
  const tables: Record<string, Row[]> = {}
  for (const table of BACKUP_TABLES) {
    // Nom de table issu d'une liste fixe (jamais d'une entrée utilisateur).
    tables[table] = await prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM "${table}" ORDER BY "id"`)
  }
  return { exportedAt: new Date().toISOString(), tables }
}

export async function buildEncryptedBackup(): Promise<{
  filename: string
  content: Buffer
  summary: Record<string, number>
}> {
  const key = process.env.BACKUP_ENCRYPTION_KEY
  if (!key) throw new Error('BACKUP_ENCRYPTION_KEY manquant : sauvegarde impossible')
  const data = await exportBusinessData()
  const content = encodeBackup(data, key)
  const stamp = data.exportedAt.slice(0, 10)
  return { filename: `agenda-sauvegarde-${stamp}.agbk`, content, summary: summarizeBackup(data) }
}
