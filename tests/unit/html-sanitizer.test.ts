import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeHtml } from '../../utils/html-sanitizer.ts'

const TAB = String.fromCharCode(9)

// Each of these is a working payload against a regex-based sanitizer. The mXSS
// ones (math/svg/xmp/noscript/template) turn on a parser disagreeing with the
// browser about where an element ends, which is exactly what a real parser plus
// a drop-the-subtree allowlist takes away.
const VECTORS: Array<[string, string]> = [
  ['inline handler', '<img src=x onerror=alert(1)>'],
  ['javascript: href', '<a href="javascript:alert(1)">x</a>'],
  ['entity-encoded protocol', '<a href="&#106;avascript:alert(1)">x</a>'],
  ['padded, mixed-case protocol', '<a href="  JaVaScRiPt:alert(1)">x</a>'],
  ['tab inside the protocol', `<a href="java${TAB}script:alert(1)">x</a>`],
  ['data: URL document', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'],
  ['vbscript: href', '<a href="vbscript:alert(1)">x</a>'],
  ['namespaced href', '<a xlink:href="javascript:alert(1)">x</a>'],
  ['srcset', '<img src="x" srcset="javascript:alert(1)">'],
  ['script in svg', '<svg><script>alert(1)</script></svg>'],
  ['script whose body contains its own end tag', '<div><script>var a = "</scr" + "ipt>";</script></div>'],
  ['style with a javascript: url', '<style>body{background:url(javascript:alert(1))}</style>'],
  ['payload hidden in a comment', '<!-- <img src=x onerror=alert(1)> -->'],
  ['noscript boundary', '<noscript><p title="</noscript><img src=x onerror=alert(1)>">'],
  ['mXSS via math/mglyph/style', '<math><mtext><table><mglyph><style><!--</style><img src onerror=alert(1)>'],
  ['mXSS via form/math/svg', '<form><math><mtext></form><form><mglyph><svg><mtext><style><path id="</style><img onerror=alert(1) src>">'],
  ['mXSS via svg foreignObject', '<svg><foreignObject><math><mtext><table><mglyph><style><!--</style><img src onerror=alert(1)>'],
  ['iframe srcdoc', '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>'],
  ['xmp boundary', '<xmp><p title="</xmp><img src=x onerror=alert(1)>">'],
  ['select/noembed boundary', '<select><noembed></select><img src=x onerror=alert(1)>'],
  ['template', '<template><script>alert(1)</script></template>'],
]

const DANGEROUS = /\son\w+\s*=|javascript:|<script|<style|<iframe|data:text\/html|vbscript:/i

for (const [name, payload] of VECTORS) {
  test(`sanitizeHtml neutralizes: ${name}`, () => {
    const output = sanitizeHtml(payload)
    assert.ok(!DANGEROUS.test(output), `left something executable behind: ${output}`)
  })
}

test('sanitizeHtml keeps ordinary prose, links and images intact', () => {
  assert.equal(
    sanitizeHtml('<h2 id="a">Hi</h2><p>Read <a href="/docs" title="t">the docs</a>.</p><img src="https://x/y.png" alt="y">'),
    '<h2 id="a">Hi</h2><p>Read <a href="/docs" title="t">the docs</a>.</p><img src="https://x/y.png" alt="y">',
  )
})

test('sanitizeHtml preserves relative, fragment, mailto and tel URLs', () => {
  for (const href of ['/a/b', '#section', '?q=1', 'page.html', 'mailto:a@b.co', 'tel:+6612345', 'https://a.co']) {
    assert.equal(sanitizeHtml(`<a href="${href}">x</a>`), `<a href="${href}">x</a>`, href)
  }
})

// The reason there is one sanitizer and not two: `marked` escapes apostrophes
// and quotes, and the parser decodes them on the way back out. When the server
// and the browser ran different sanitizers they disagreed here on 131 of the
// 598 blocks in the content corpus, and every one of those was a hydration
// mismatch.
test('sanitizeHtml decodes the entity forms marked emits', () => {
  assert.equal(
    sanitizeHtml('<p>you&#39;re &quot;here&quot; &amp; A &lt;b&gt;</p>'),
    '<p>you\'re "here" &amp; A &lt;b&gt;</p>',
  )
})

test('sanitizeHtml escapes a bare ampersand rather than leaving it ambiguous', () => {
  assert.equal(sanitizeHtml('<h3>Food & Drink</h3>'), '<h3>Food &amp; Drink</h3>')
})

test('sanitizeHtml is idempotent', () => {
  const once = sanitizeHtml('<p>you&#39;re here & <a href="javascript:x">gone</a><script>x</script></p>')
  assert.equal(sanitizeHtml(once), once)
})

test('sanitizeHtml returns an empty string for empty input', () => {
  assert.equal(sanitizeHtml(''), '')
})
