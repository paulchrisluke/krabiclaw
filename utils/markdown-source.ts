export function replaceMarkdownRange(source: string, start: number, end: number, replacement: string) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.length) {
    throw new RangeError('Invalid Markdown source range')
  }
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

export function splitMarkdownAt(source: string, position: number) {
  if (!Number.isInteger(position) || position < 0 || position > source.length) {
    throw new RangeError('Invalid Markdown split position')
  }
  return { before: source.slice(0, position), after: source.slice(position) }
}
