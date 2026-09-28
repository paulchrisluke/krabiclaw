import assert from 'node:assert/strict'
import test from 'node:test'
import { renderContentBlocksForLlm } from '../../server/utils/platform-llm.ts'

test('LLM video rendering uses a plain watch URL without a name and keeps descriptions', () => {
  const url = 'https://youtu.be/abc123DEF45'
  const watchUrl = 'https://www.youtube.com/watch?v=abc123DEF45'
  const blocks = [
    { type: 'video', position: 0, level: null, data: { url, caption: '  First description  ' }, media: [] },
    { type: 'video', position: 1, level: null, data: { url, title: '  Walkthrough  ', caption: '  Second description  ' }, media: [] },
  ]

  assert.equal(renderContentBlocksForLlm(blocks), `${watchUrl}\n\nFirst description\n\n[Walkthrough](${watchUrl})\n\nSecond description`)
})
