import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_MARKDOWN_BYTES,
  assertMarkdownSize,
  decodeMarkdownText,
  isMarkdownFilename,
  parseMarkdownDocument,
  resolveMarkdownMimeType,
} from '../../server/utils/markdown-document.ts'

test('resolveMarkdownMimeType recognizes declared markdown MIME types', () => {
  assert.equal(resolveMarkdownMimeType('text/markdown'), 'text/markdown')
  assert.equal(resolveMarkdownMimeType('text/x-markdown'), 'text/markdown')
  assert.equal(resolveMarkdownMimeType('TEXT/MARKDOWN'), 'text/markdown')
})

test('resolveMarkdownMimeType falls back to the .md/.markdown extension when the MIME type is generic', () => {
  assert.equal(resolveMarkdownMimeType('application/octet-stream', 'notes.md'), 'text/markdown')
  assert.equal(resolveMarkdownMimeType(undefined, 'README.MARKDOWN'), 'text/markdown')
  assert.equal(resolveMarkdownMimeType(null, 'menu.txt'), null)
})

test('resolveMarkdownMimeType rejects unrelated types', () => {
  assert.equal(resolveMarkdownMimeType('application/pdf', 'file.pdf'), null)
  assert.equal(resolveMarkdownMimeType('image/png'), null)
})

test('isMarkdownFilename matches both supported extensions case-insensitively', () => {
  assert.equal(isMarkdownFilename('notes.md'), true)
  assert.equal(isMarkdownFilename('NOTES.MARKDOWN'), true)
  assert.equal(isMarkdownFilename('notes.txt'), false)
  assert.equal(isMarkdownFilename(undefined), false)
})

test('assertMarkdownSize rejects files over the configured limit with a clear message', () => {
  assert.doesNotThrow(() => assertMarkdownSize(MAX_MARKDOWN_BYTES))
  assert.throws(
    () => assertMarkdownSize(MAX_MARKDOWN_BYTES + 1),
    /too large/i,
  )
})

test('decodeMarkdownText decodes valid UTF-8, including multi-byte characters', () => {
  const text = '# Café ☕\n\nBonjour à tous.'
  const bytes = new TextEncoder().encode(text)
  assert.equal(decodeMarkdownText(bytes.buffer), text)
})

test('decodeMarkdownText throws a clear error on invalid UTF-8 instead of silently replacing bytes', () => {
  // 0xFF 0xFE is not a valid UTF-8 sequence.
  const invalid = new Uint8Array([0x23, 0x20, 0xff, 0xfe, 0x41])
  assert.throws(
    () => decodeMarkdownText(invalid.buffer),
    /not valid UTF-8/i,
  )
})

test('parseMarkdownDocument distinguishes headings, lists, tables, links, blockquotes, and fenced code', () => {
  const source = `# Title

Intro paragraph with a [link](https://example.com/docs "Docs").

## Section

- item one
- item two
1. step one
2. step two

> Important note
> spanning two lines.

| Name | Price |
| --- | --- |
| Latte | 4.50 |
| Tea | 3.00 |

\`\`\`js
const x = 1;
\`\`\`
`

  const parsed = parseMarkdownDocument(source)

  const types = parsed.blocks.map((b) => b.type)
  assert.deepEqual(types, [
    'heading',
    'paragraph',
    'heading',
    'list',
    'blockquote',
    'table',
    'code',
  ])

  assert.deepEqual(parsed.headingOutline, [
    { level: 1, text: 'Title' },
    { level: 2, text: 'Section' },
  ])

  assert.equal(parsed.stats.headings, 2)
  assert.equal(parsed.stats.listItems, 4)
  assert.equal(parsed.stats.tableRows, 2)
  assert.equal(parsed.stats.codeBlocks, 1)
  assert.equal(parsed.stats.blockquotes, 1)
  assert.equal(parsed.links.length, 1)
  assert.equal(parsed.links[0]?.url, 'https://example.com/docs')
  assert.equal(parsed.links[0]?.text, 'link')

  const codeBlock = parsed.blocks.find((b) => b.type === 'code')
  assert.equal(codeBlock?.language, 'js')
  assert.equal(codeBlock?.raw.trim(), 'const x = 1;')

  // Structural cues must survive into the LLM-facing text, not just the
  // internal block list.
  assert.match(parsed.structuredText, /\[HEADING level=1\] Title/)
  assert.match(parsed.structuredText, /\[HEADING level=2\] Section/)
  assert.match(parsed.structuredText, /\[LIST\][\s\S]*item one[\s\S]*\[\/LIST\]/)
  assert.match(parsed.structuredText, /\[TABLE\][\s\S]*Latte[\s\S]*\[\/TABLE\]/)
  assert.match(parsed.structuredText, /\[BLOCKQUOTE\][\s\S]*Important note[\s\S]*\[\/BLOCKQUOTE\]/)
  assert.match(parsed.structuredText, /\[CODE lang=js\][\s\S]*const x = 1;[\s\S]*\[\/CODE\]/)
})

test('parseMarkdownDocument handles an unterminated fenced code block without hanging or losing content', () => {
  const source = '# Doc\n\n```py\nprint(1)\n'
  const parsed = parseMarkdownDocument(source)
  const codeBlock = parsed.blocks.find((b) => b.type === 'code')
  assert.ok(codeBlock)
  assert.match(codeBlock!.raw, /print\(1\)/)
})

test('parseMarkdownDocument treats a document with no special syntax as plain paragraphs', () => {
  const parsed = parseMarkdownDocument('Just a plain sentence.\n\nAnother plain sentence.')
  assert.deepEqual(parsed.blocks.map((b) => b.type), ['paragraph', 'paragraph'])
  assert.equal(parsed.stats.headings, 0)
  assert.equal(parsed.stats.links, 0)
})
