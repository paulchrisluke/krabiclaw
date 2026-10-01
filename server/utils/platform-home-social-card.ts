/** The live hero rotates; a share card states the complete phrase once. */
export function platformHomeSocialCardCopy(data: Record<string, unknown>): { title: string; description: string | null } | null {
  const title = typeof data.title === 'string' ? data.title.trim() : ''
  if (!title) return null
  const accents = Array.isArray(data.rotating_accents)
    ? data.rotating_accents.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).map(value => value.trim())
    : []
  return {
    title: [title, accents.join(', ')].filter(Boolean).join(' '),
    description: typeof data.subtitle === 'string' ? data.subtitle.trim() || null : null,
  }
}
