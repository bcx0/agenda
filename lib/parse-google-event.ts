export type ParsedEventType = 'booking' | 'block_perso' | 'block_simple'

export interface ParsedGoogleEvent {
  type: ParsedEventType
  clientName: string | null
  reason: string
  originalSummary: string
}

const PERSO_KEYWORDS = ['perso', 'personnel', 'personnelle', 'prive', 'privé', 'privée']

export function parseGoogleEventSummary(summary: string | undefined | null): ParsedGoogleEvent {
  const original = (summary || '').trim()
  const normalized = original.toLowerCase()

  if (!normalized.startsWith('rdv')) {
    return {
      type: 'block_simple',
      clientName: null,
      reason: original || 'Indisponible',
      originalSummary: original,
    }
  }

  let afterRdv = original
    .substring(3)
    .replace(/^[\s+\-:]+/, '')
    .trim()

  if (!afterRdv) {
    return {
      type: 'block_perso',
      clientName: null,
      reason: 'Personnel',
      originalSummary: original,
    }
  }

  const afterRdvLower = afterRdv.toLowerCase()
  const isPerso = PERSO_KEYWORDS.some(keyword => afterRdvLower === keyword)

  if (isPerso) {
    return {
      type: 'block_perso',
      clientName: null,
      reason: 'Personnel',
      originalSummary: original,
    }
  }

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
