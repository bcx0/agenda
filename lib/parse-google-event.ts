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

  // Match "RDV" (case-insensitive) followed by optional separators then content
  // Supports: "RDV - Jean", "rdv—Jean", "Rdv : Jean", "RDV Jean", "rdv/Jean", etc.
  const rdvMatch = original.match(/^rdv[\s\-—–―:+/\\|,.*·•]+(.+)$/i)
  // Also match "RDV" alone or "RDVJean" (no separator, just letters after rdv)
  const rdvAlone = !rdvMatch && /^rdv$/i.test(original)
  const rdvGlued = !rdvMatch && !rdvAlone && original.match(/^rdv(.+)$/i)

  if (!rdvMatch && !rdvAlone && !rdvGlued) {
    return {
      type: 'block_simple',
      clientName: null,
      reason: original || 'Indisponible',
      originalSummary: original,
    }
  }

  // Extract the part after "RDV" + separators
  // Always strip leading separator-like chars (covers rdvGlued path too)
  let afterRdv = ''
  if (rdvMatch) {
    afterRdv = rdvMatch[1].trim()
  } else if (rdvGlued) {
    afterRdv = rdvGlued[1]
      .replace(/^[\s\-—–―~>:+/\\|,.*·•#=_]+/, '')
      .trim()
  }

  // If nothing remains (or only non-alpha chars), treat as personal block
  if (!afterRdv || !/[a-zA-ZÀ-ÿ]/.test(afterRdv)) {
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
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')

  return {
    type: 'booking',
    clientName,
    reason: `RDV — ${clientName}`,
    originalSummary: original,
  }
}
