export type ParsedEventType = 'booking' | 'block_perso' | 'block_simple'

export interface ParsedGoogleEvent {
  type: ParsedEventType
  clientName: string | null
  reason: string
  originalSummary: string
}

const PERSO_KEYWORDS = [
  'perso', 'personnel', 'personnelle', 'prive', 'privé', 'privée',
  'indisponible', 'pause', 'break', 'lunch', 'déjeuner', 'repos',
  'vacances', 'congé', 'congés', 'férié', 'ferie',
]

// Préfixes reconnus comme "RDV" (insensible à la casse)
const RDV_PREFIXES = ['rdv', 'rendez-vous', 'rendezvous', 'rv']

/**
 * Détecte si le summary commence par un préfixe de type RDV.
 * Retourne le texte après le préfixe, ou null si pas de préfixe trouvé.
 */
function extractAfterRdvPrefix(original: string): string | null {
  const normalized = original.toLowerCase()

  for (const prefix of RDV_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      const rest = original.substring(prefix.length)
      return rest.replace(/^[\s+\-—:]+/, '').trim()
    }
  }

  return null
}

export function parseGoogleEventSummary(summary: string | undefined | null): ParsedGoogleEvent {
  const original = (summary || '').trim()
  const normalized = original.toLowerCase()

  const afterRdv = extractAfterRdvPrefix(original)

  // Pas de préfixe RDV → block_simple (le sync-engine vérifiera si c'est un client)
  if (afterRdv === null) {
    return {
      type: 'block_simple',
      clientName: null,
      reason: original || 'Indisponible',
      originalSummary: original,
    }
  }

  // Préfixe RDV trouvé mais rien après → personnel
  if (!afterRdv) {
    return {
      type: 'block_perso',
      clientName: null,
      reason: 'Personnel',
      originalSummary: original,
    }
  }

  const afterRdvLower = afterRdv.toLowerCase()

  // Vérifier si c'est un mot-clé personnel (match exact OU contenu dans le texte)
  const isPerso = PERSO_KEYWORDS.some(keyword =>
    afterRdvLower === keyword || afterRdvLower.startsWith(keyword + ' ')
  )

  if (isPerso) {
    return {
      type: 'block_perso',
      clientName: null,
      reason: 'Personnel',
      originalSummary: original,
    }
  }

  // C'est un RDV client → extraire le nom
  const clientName = afterRdv
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')

  return {
    type: 'booking',
    clientName,
    reason: `RDV — ${clientName}`,
    originalSummary: original,
  }
}
