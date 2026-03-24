/**
 * Script one-shot : nettoyage des doublons clients + bookings
 *
 * EXECUTION :
 *   npx tsx scripts/cleanup-duplicates.ts          # dry-run
 *   npx tsx scripts/cleanup-duplicates.ts --execute # appliquer
 *
 * CE QUE CA FAIT :
 * 1. Fusionne les clients en doublon (meme nom, case-insensitive)
 * 2. Supprime les bookings en doublon (meme googleEventId)
 * 3. Supprime les blocks en doublon (meme googleEventId)
 *
 * MODE DRY-RUN par defaut : ajouter --execute pour vraiment modifier la base
 */

import * as fs from 'fs'
import * as path from 'path'

// Charger .env.local manuellement (pas besoin de dotenv)
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    // Retirer les guillemets si présents
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

// Utiliser DIRECT_URL pour la connexion directe (sans pooler PgBouncer)
if (process.env['DIRECT_URL']) {
  process.env['DATABASE_URL'] = process.env['DIRECT_URL']
}

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const isDryRun = !process.argv.includes('--execute')

async function main() {
  if (isDryRun) {
    console.log('MODE DRY-RUN -- aucune modification. Ajouter --execute pour appliquer.\n')
  } else {
    console.log('MODE EXECUTION -- les modifications seront appliquees.\n')
  }

  // --- 1. CLIENTS EN DOUBLON ---
  console.log('=== ETAPE 1 : Clients en doublon (meme nom, case-insensitive) ===\n')

  const allClients = await prisma.client.findMany({
    orderBy: { createdAt: 'asc' },
    include: { bookings: { select: { id: true } } },
  })

  // Grouper par nom en lowercase
  const clientGroups: Record<string, typeof allClients> = {}
  for (const client of allClients) {
    const key = client.name.trim().toLowerCase()
    if (!clientGroups[key]) {
      clientGroups[key] = []
    }
    clientGroups[key].push(client)
  }

  let clientsMerged = 0
  let clientsDeleted = 0

  const clientKeys = Object.keys(clientGroups)
  for (let i = 0; i < clientKeys.length; i++) {
    const group = clientGroups[clientKeys[i]]
    if (group.length <= 1) continue

    const keeper = group[0] // le plus ancien (orderBy createdAt asc)
    const duplicates = group.slice(1)

    console.log(`  Client "${keeper.name}" (ID ${keeper.id}) -- ${duplicates.length} doublon(s) :`)
    for (const dup of duplicates) {
      console.log(`    > ID ${dup.id} "${dup.name}" (${dup.bookings.length} booking(s))`)
    }

    if (!isDryRun) {
      for (const dup of duplicates) {
        if (dup.bookings.length > 0) {
          await prisma.booking.updateMany({
            where: { clientId: dup.id },
            data: { clientId: keeper.id },
          })
          console.log(`    [OK] ${dup.bookings.length} booking(s) transfere(s) vers ID ${keeper.id}`)
        }

        await prisma.recurringBlock.updateMany({
          where: { clientId: dup.id },
          data: { clientId: keeper.id },
        })

        await prisma.client.delete({ where: { id: dup.id } })
        console.log(`    [DEL] Client doublon ID ${dup.id} supprime`)
        clientsDeleted++
      }
      clientsMerged++
    }
  }

  console.log(`\n  Resultat : ${clientsMerged} client(s) fusionne(s), ${clientsDeleted} doublon(s) supprime(s)\n`)

  // --- 2. BOOKINGS EN DOUBLON (meme googleEventId) ---
  console.log('=== ETAPE 2 : Bookings en doublon (meme googleEventId) ===\n')

  const bookingsWithGoogleId = await prisma.booking.findMany({
    where: { googleEventId: { not: null } },
    orderBy: { createdAt: 'asc' },
  })

  const bookingGroups: Record<string, typeof bookingsWithGoogleId> = {}
  for (const booking of bookingsWithGoogleId) {
    const key = booking.googleEventId!
    if (!bookingGroups[key]) {
      bookingGroups[key] = []
    }
    bookingGroups[key].push(booking)
  }

  let bookingsDeleted = 0

  const bookingKeys = Object.keys(bookingGroups)
  for (let i = 0; i < bookingKeys.length; i++) {
    const gEventId = bookingKeys[i]
    const group = bookingGroups[gEventId]
    if (group.length <= 1) continue

    const keeper = group[0]
    const duplicates = group.slice(1)

    console.log(`  googleEventId "${gEventId}" -- ${group.length} booking(s) :`)
    console.log(`    Garde : ID ${keeper.id} (cree ${keeper.createdAt.toISOString()})`)

    if (!isDryRun) {
      for (const dup of duplicates) {
        await prisma.booking.delete({ where: { id: dup.id } })
        console.log(`    [DEL] Doublon supprime : ID ${dup.id}`)
        bookingsDeleted++
      }
    } else {
      for (const dup of duplicates) {
        console.log(`    > Doublon : ID ${dup.id} (cree ${dup.createdAt.toISOString()})`)
      }
    }
  }

  console.log(`\n  Resultat : ${bookingsDeleted} booking(s) doublon(s) supprime(s)\n`)

  // --- 3. BLOCKS EN DOUBLON (meme googleEventId) ---
  console.log('=== ETAPE 3 : Blocks en doublon (meme googleEventId) ===\n')

  const blocksWithGoogleId = await prisma.block.findMany({
    where: { googleEventId: { not: null } },
    orderBy: { createdAt: 'asc' },
  })

  const blockGroups: Record<string, typeof blocksWithGoogleId> = {}
  for (const block of blocksWithGoogleId) {
    const key = block.googleEventId!
    if (!blockGroups[key]) {
      blockGroups[key] = []
    }
    blockGroups[key].push(block)
  }

  let blocksDeleted = 0

  const blockKeys = Object.keys(blockGroups)
  for (let i = 0; i < blockKeys.length; i++) {
    const gEventId = blockKeys[i]
    const group = blockGroups[gEventId]
    if (group.length <= 1) continue

    const keeper = group[0]
    const duplicates = group.slice(1)

    console.log(`  googleEventId "${gEventId}" -- ${group.length} block(s) :`)
    console.log(`    Garde : ID ${keeper.id} (cree ${keeper.createdAt.toISOString()})`)

    if (!isDryRun) {
      for (const dup of duplicates) {
        await prisma.block.delete({ where: { id: dup.id } })
        console.log(`    [DEL] Doublon supprime : ID ${dup.id}`)
        blocksDeleted++
      }
    } else {
      for (const dup of duplicates) {
        console.log(`    > Doublon : ID ${dup.id} (cree ${dup.createdAt.toISOString()})`)
      }
    }
  }

  console.log(`\n  Resultat : ${blocksDeleted} block(s) doublon(s) supprime(s)\n`)

  // --- RESUME ---
  console.log('=== RESUME ===')
  if (isDryRun) {
    console.log('Mode DRY-RUN. Aucune modification effectuee.')
    console.log('Pour appliquer : npx tsx scripts/cleanup-duplicates.ts --execute')
  } else {
    console.log(`Clients fusionnes : ${clientsMerged}`)
    console.log(`Clients doublons supprimes : ${clientsDeleted}`)
    console.log(`Bookings doublons supprimes : ${bookingsDeleted}`)
    console.log(`Blocks doublons supprimes : ${blocksDeleted}`)
  }
}

main()
  .catch((e) => {
    console.error('ERREUR :', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
