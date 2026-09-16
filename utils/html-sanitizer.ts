/**
 * The one HTML sanitizer.
 *
 * Every surface that hands authored HTML to `v-html` goes through
 * `sanitizeHtml`, on the server and in the browser, and gets the same string
 * back. That identity is what keeps a server-rendered page and its hydrated
 * counterpart byte-for-byte equal; it is verified against the whole content
 * corpus in `tests/unit/html-sanitizer.test.ts`.
 *
 * The policy below — which elements survive, which attributes survive, which
 * URL protocols survive — is the whole of it. Parsing and serialising are the
 * platform's job: the browser's own inert-document parser where there is one,
 * `parse5` (the parser jsdom itself uses) on the Workers runtime, which has no
 * DOM. Both build the same tree for the same bytes, so one filter over that
 * tree is one sanitizer, not two.
 *
 * Elements outside the allowlist are dropped with their subtree rather than
 * unwrapped. That is what takes the teeth out of mXSS: the payloads that
 * exploit parser disagreement all hide inside raw-text or foreign-content
 * elements (`style`, `svg`, `math`, `noscript`, `xmp`, `template`), and a
 * dropped subtree is gone however it was parsed.
 */
import { parseFragment, serialize } from 'parse5'

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup', 'dd', 'del', 'details',
  'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i',
  'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'samp', 'small', 'span', 'strong',
  'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul',
  'var', 'wbr',
])

const ALLOWED_ATTRS = new Set([
  'align', 'alt', 'cite', 'class', 'colspan', 'datetime', 'dir', 'height', 'href', 'id', 'lang',
  'loading', 'open', 'rel', 'reversed', 'rowspan', 'sizes', 'src', 'srcset', 'start', 'target',
  'title', 'type', 'value', 'width',
])

/** Attributes whose value is fetched or navigated to, so whose protocol matters. */
const URL_ATTRS = new Set(['cite', 'href', 'src', 'srcset'])

const SAFE_PROTOCOLS = new Set(['ftp', 'http', 'https', 'mailto', 'tel'])

const XHTML_NS = 'http://www.w3.org/1999/xhtml'

/**
 * Decodes the entity forms and strips the control characters a protocol can be
 * hidden behind (`&#106;avascript:`, `java\tscript:`) before it is read. Not a
 * general entity decoder — it only has to expose the scheme.
 */
function protocolOf(value: string): string | null {
  const normalized = value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec: string) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/gi, '&')
    // eslint-disable-next-line no-control-regex -- control chars are the obfuscation being stripped
    .replace(/[\u0000-\u0020\u007f]+/g, '')
    .toLowerCase()
  // A colon before any `/`, `?` or `#` is a scheme; anything else is a path,
  // a query or a fragment, and relative URLs have no scheme at all.
  const match = /^([a-z0-9+.-]*):/.exec(normalized)
  return match ? match[1]! : null
}

function attributeSurvives(name: string, value: string): boolean {
  if (!ALLOWED_ATTRS.has(name)) return false
  if (!URL_ATTRS.has(name)) return true
  const protocol = protocolOf(value)
  return protocol === null || SAFE_PROTOCOLS.has(protocol)
}

function elementSurvives(tagName: string, namespace: string | undefined): boolean {
  return ALLOWED_TAGS.has(tagName) && (namespace === undefined || namespace === XHTML_NS)
}

// ─── Browser: the platform's own inert parser ────────────────────────────────

function sanitizeDomElement(element: Element): void {
  for (const attribute of [...element.attributes]) {
    if (!attributeSurvives(attribute.name.toLowerCase(), attribute.value)) {
      element.removeAttributeNode(attribute)
    }
  }
  for (const child of [...element.childNodes]) {
    if (child.nodeType === 8 /* Comment */) {
      child.remove()
      continue
    }
    if (child.nodeType !== 1 /* Element */) continue
    const childElement = child as Element
    if (!elementSurvives(childElement.tagName.toLowerCase(), childElement.namespaceURI ?? undefined)) {
      childElement.remove()
      continue
    }
    sanitizeDomElement(childElement)
  }
}

function sanitizeInBrowser(html: string): string {
  // A detached document: assigning innerHTML here parses without fetching a
  // single URL or running a single script, which is what makes the tree safe
  // to inspect before any of it reaches the live document.
  const inert = document.implementation.createHTMLDocument('')
  inert.body.innerHTML = html
  sanitizeDomElement(inert.body)
  return inert.body.innerHTML
}

// ─── Workers/Node: parse5, the parser jsdom is built on ──────────────────────

interface Parse5Attr { name: string, value: string, prefix?: string }
interface Parse5Node {
  nodeName: string
  tagName?: string
  namespaceURI?: string
  attrs?: Parse5Attr[]
  childNodes?: Parse5Node[]
}

function sanitizeParse5Node(node: Parse5Node): void {
  const children = node.childNodes
  if (!children) return
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index]!
    if (child.nodeName === '#comment') {
      children.splice(index, 1)
      continue
    }
    if (child.tagName === undefined) continue // text, doctype
    if (!elementSurvives(child.tagName, child.namespaceURI)) {
      children.splice(index, 1)
      continue
    }
    child.attrs = (child.attrs ?? []).filter(attr =>
      !attr.prefix && attributeSurvives(attr.name.toLowerCase(), attr.value))
    sanitizeParse5Node(child)
  }
}

function sanitizeWithParse5(html: string): string {
  const fragment = parseFragment(html) as unknown as Parse5Node
  sanitizeParse5Node(fragment)
  return serialize(fragment as never)
}

/**
 * Strips everything outside the policy above from a fragment of HTML.
 * Synchronous and identical on both runtimes — call it wherever the HTML is
 * about to be rendered, and never render HTML that has not been through it.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  return import.meta.client ? sanitizeInBrowser(html) : sanitizeWithParse5(html)
}
