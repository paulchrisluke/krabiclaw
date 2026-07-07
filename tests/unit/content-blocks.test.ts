import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildContentBlocks, normalizeContentComponent, type ContentComponent } from '../../utils/content-blocks.ts'

function renderMarkdown(markdown: string) {
  return `<p>${markdown.trim()}</p>`
}

test('normalizeContentComponent drops inactive or empty components', () => {
  const inactive = normalizeContentComponent({
    type: 'faq',
    status: 'inactive',
    data: { items: [{ question: 'Q', answer: 'A' }] },
  }, renderMarkdown)

  const empty = normalizeContentComponent({
    type: 'how_to',
    status: 'active',
    data: { steps: [{ name: 'Only title', text: '' }] },
  }, renderMarkdown)

  assert.equal(inactive, null)
  assert.equal(empty, null)
})

test('buildContentBlocks interleaves prose and embedded components in body order', () => {
  const components: ContentComponent[] = [
    {
      type: 'faq',
      position: 2,
      data: {
        items: [
          { question: 'What is KrabiClaw?', answer: 'A platform.' },
        ],
      },
    },
    {
      type: 'how_to',
      position: 1,
      data: {
        steps: [
          { name: 'First', text: 'Do this first.' },
          { name: 'Second', text: 'Do this second.' },
        ],
      },
    },
  ]

  const blocks = buildContentBlocks(
    [
      '# Intro',
      '',
      '{{component type="how_to"}}',
      '',
      'Middle copy',
      '',
      "{{component type='faq'}}",
      '',
      'Closing copy',
    ].join('\n'),
    components,
    renderMarkdown,
  )

  assert.equal(blocks.length, 5)
  assert.deepEqual(
    blocks.map(block => block.kind === 'html' ? 'html' : `${block.kind}:${block.type}`),
    ['html', 'component:how_to', 'html', 'component:faq', 'html'],
  )

  assert.match((blocks[0] as { kind: 'html'; html: string }).html, /Intro/)
  assert.equal((blocks[1] as { kind: 'component'; type: string }).type, 'how_to')
  assert.equal((blocks[3] as { kind: 'component'; type: string }).type, 'faq')
})

test('buildContentBlocks skips unmatched embeds without appending leftover components', () => {
  const blocks = buildContentBlocks(
    'Body before\n\n{{component type="faq"}}\n\nBody after',
    [
      {
        type: 'how_to',
        data: {
          steps: [
            { name: 'First', text: 'Do this first.' },
            { name: 'Second', text: 'Do this second.' },
          ],
        },
      },
    ],
    renderMarkdown,
  )

  assert.equal(blocks.length, 2)
  assert.deepEqual(
    blocks.map(block => block.kind),
    ['html', 'html'],
  )
})

test('buildContentBlocks renders multiple ai assistance embeds in position order', () => {
  const components: ContentComponent[] = [
    {
      type: 'ai_assistance',
      position: 2,
      label: 'AI Help',
      data: {
        prompts: [
          { title: 'Second', prompt: 'Use the second prompt.', position: 0 },
        ],
      },
    },
    {
      type: 'ai_assistance',
      position: 1,
      data: {
        prompts: [
          { title: 'First', prompt: 'Use the first prompt.', position: 0 },
        ],
      },
    },
  ]

  const blocks = buildContentBlocks(
    [
      'Before',
      '',
      '{{component type="ai_assistance"}}',
      '',
      'Middle',
      '',
      '{{component type="ai_assistance"}}',
    ].join('\n'),
    components,
    renderMarkdown,
  )

  assert.deepEqual(
    blocks.map(block => block.kind === 'html' ? 'html' : `${block.kind}:${block.type}`),
    ['html', 'component:ai_assistance', 'html', 'component:ai_assistance'],
  )
  const first = blocks[1] as { kind: 'component'; type: string; props: { prompts: Array<{ prompt: string }> } }
  const second = blocks[3] as { kind: 'component'; type: string; props: { prompts: Array<{ prompt: string }> } }
  assert.equal(first.type, 'ai_assistance')
  assert.equal(first.props.prompts[0]?.prompt, 'Use the first prompt.')
  assert.equal(second.props.prompts[0]?.prompt, 'Use the second prompt.')
})
