import { marked } from 'marked'

export function renderMarkdownToHtml(markdown: string) {
  return marked.parse(markdown, { gfm: true, breaks: true }) as string
}

export function htmlToPlainText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function markdownToPlainText(markdown: string) {
  return htmlToPlainText(renderMarkdownToHtml(markdown || ''))
}

// Decodes named/numeric HTML entities so an attacker can't smuggle a dangerous
// protocol past the literal-string checks below (e.g. `&#106;avascript:` or
// `&#x6a;avascript:`). Limited to entities relevant to protocol obfuscation —
// not a general-purpose entity decoder.
function decodeEntitiesForProtocolCheck(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/gi, '&')
}

// DOMPurify needs jsdom, which breaks on the Workers SSR runtime (no real DOM
// globals). This is a regex-based stopgap for the SSR render pass only — it
// strips the dangerous constructs (script/style/embeds, event handlers,
// javascript: URLs) that marked's own output never produces from trusted
// markdown anyway. The client re-renders through real DOMPurify on hydration.
export function sanitizeHtmlForSsr(html: string) {
  return html
    .replace(/<(script|style|iframe|object|embed|link|meta)\b[\s\S]*?(<\/\1>|\/?>)/gi, '')
    .replace(/\son\w+\s*=\s*("[\s\S]*?"|'[\s\S]*?'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])([\s\S]*?)\2/gi, (match, attr, quote, value) => {
      // Strip control/whitespace chars (the WHATWG URL parser ignores them
      // anywhere in a scheme too, e.g. `java\tscript:`), then decode entities,
      // before checking the protocol — both are common obfuscation vectors.
      const normalized = decodeEntitiesForProtocolCheck(value)
        // eslint-disable-next-line no-control-regex -- intentionally stripping control chars used to obfuscate protocols
        .replace(/[\u0000-\u001f\u007f\s]+/g, '')
        .toLowerCase()
      if (/^(javascript|data|vbscript|file):/i.test(normalized)) {
        return `${attr}=${quote}#${quote}`
      }
      return match
    })
}
