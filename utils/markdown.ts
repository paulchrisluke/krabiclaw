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

// DOMPurify needs jsdom, which breaks on the Workers SSR runtime (no real DOM
// globals). This is a regex-based stopgap for the SSR render pass only — it
// strips the dangerous constructs (script/style/embeds, event handlers,
// javascript: URLs) that marked's own output never produces from trusted
// markdown anyway. The client re-renders through real DOMPurify on hydration.
export function sanitizeHtmlForSsr(html: string) {
  return html
    .replace(/<(script|style|iframe|object|embed|link|meta)\b[\s\S]*?(<\/\1>|\/?>)/gi, '')
    .replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2#$2')
}
