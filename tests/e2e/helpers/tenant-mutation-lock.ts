import { mkdir, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { TestInfo } from '@playwright/test'

export async function acquireTenantMutationLock(testInfo: TestInfo, tenantId: string) {
  // FullConfig has no outputDir; it lives on the project, and testInfo.outputDir
  // is per-test, so neither would give workers a shared lock root.
  const lockRoot = join(testInfo.project.outputDir, 'tenant-mutation-locks')
  const lockPath = join(lockRoot, tenantId)
  await mkdir(lockRoot, { recursive: true })

  // A worker that dies without releasing must not hang every other worker until
  // the hook timeout with no explanation of what it was waiting for.
  const deadline = Date.now() + 300_000
  while (true) {
    try {
      await mkdir(lockPath)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (Date.now() > deadline) throw new Error(`Timed out waiting for the ${tenantId} mutation lock at ${lockPath}`, { cause: error })
      await delay(100)
    }
  }

  return () => rmdir(lockPath)
}
