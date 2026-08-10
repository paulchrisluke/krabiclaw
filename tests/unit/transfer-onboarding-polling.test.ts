import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../pages/dashboard/[orgSlug]/onboarding.vue', import.meta.url), 'utf8')

test('transfer onboarding owns one polling loop and cancels its pending wait on unmount', () => {
  assert.match(source, /let pollLoop: Promise<void> \| null = null/)
  assert.match(source, /if \(pollLoop\) return pollLoop/)
  assert.match(source, /pollLoop = loopPromise/)

  const unmountBody = source.match(/onUnmounted\(\(\) => \{([\s\S]*?)\n\}\)/)?.[1] ?? ''
  assert.match(unmountBody, /disposed = true/)
  assert.match(unmountBody, /resolvePollWait\?\.\(\)/)
  assert.match(source, /clearTimeout\(timer\)/)
  assert.match(source, /resolve\(false\)/)
})
