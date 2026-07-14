export function replaceMediaUrls(value, replacements) {
  if (typeof value === 'string') {
    let updated = value
    for (const [source, destination] of replacements) {
      if (source && source !== destination) updated = updated.replaceAll(source, destination)
    }
    return updated
  }
  if (Array.isArray(value)) return value.map(item => replaceMediaUrls(item, replacements))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, replaceMediaUrls(nested, replacements)]))
}
