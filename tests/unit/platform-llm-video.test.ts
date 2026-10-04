import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLlmsTxt, renderContentBlocksForLlm } from '../../server/utils/platform-llm.ts'

test('LLM video rendering uses a plain watch URL without a name and keeps descriptions', () => {
  const url = 'https://youtu.be/abc123DEF45'
  const watchUrl = 'https://www.youtube.com/watch?v=abc123DEF45'
  const blocks = [
    { type: 'video', position: 0, level: null, data: { url, caption: '  First description  ' }, media: [] },
    { type: 'video', position: 1, level: null, data: { url, title: '  Walkthrough  ', caption: '  Second description  ' }, media: [] },
  ]

  assert.equal(renderContentBlocksForLlm(blocks), `${watchUrl}\n\nFirst description\n\n[Walkthrough](${watchUrl})\n\nSecond description`)
})

test('buildLlmsTxt includes pricing.md link on platform site', () => {
  const result = buildLlmsTxt('https://krabiclaw.com', [], [])
  assert.ok(result.includes('- [Pricing](https://krabiclaw.com/pricing.md): Plain markdown specification of plans, features, and limits.'))
})

test('buildLlmsTxt includes coreLinks when provided for tenant', () => {
  const result = buildLlmsTxt('https://restaurant.example.com', [], [], {
    title: 'Ember & Slice',
    coreLinks: [
      { title: 'Menu', path: '/menu', description: 'Current food and drink menu.' },
      { title: 'Reservations', path: '/reservations', description: 'Table bookings.' },
    ],
  })
  assert.ok(result.includes('## Overview & Services'))
  assert.ok(result.includes('- [Menu](https://restaurant.example.com/menu): Current food and drink menu.'))
  assert.ok(result.includes('- [Reservations](https://restaurant.example.com/reservations): Table bookings.'))
})

