import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const repoFile = async (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('Codex and Claude receive the same repository working rules', async () => {
  const [agents, claude] = await Promise.all([
    repoFile('AGENTS.md'),
    repoFile('CLAUDE.md'),
  ])

  assert.equal(claude, agents)
})
