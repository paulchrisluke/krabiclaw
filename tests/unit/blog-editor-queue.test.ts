import assert from 'node:assert/strict'
import test from 'node:test'
import { SerializedSnapshotQueue } from '../../utils/blog-editor.ts'

test('an edit made while an older save is in flight persists and applies only the newer snapshot', async () => {
  let releaseFirst!: () => void
  const firstInFlight = new Promise<void>((resolve) => { releaseFirst = resolve })
  const persisted: string[] = []
  const applied: string[] = []
  const queue = new SerializedSnapshotQueue<string, string>(
    async (snapshot) => {
      persisted.push(snapshot)
      if (snapshot === 'A') await firstInFlight
      return snapshot
    },
    result => applied.push(result),
  )

  queue.mark('A')
  const flush = queue.flush()
  await Promise.resolve()
  queue.mark('B')
  releaseFirst()
  await flush

  assert.deepEqual(persisted, ['A', 'B'])
  assert.deepEqual(applied, ['B'])
})
