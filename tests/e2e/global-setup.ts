import { execFileSync } from 'node:child_process'
import { E2E_DEMO_ORGANIZATION_ID, E2E_KIKUZUKI_ORGANIZATION_ID, E2E_POTTERY_ORGANIZATION_ID, testBaseUrl } from './test-env'

export default function globalSetup() {
  if (process.env.PLAYWRIGHT_CI_SEARCH_SETUP !== 'true') return
  if (process.env.PLAYWRIGHT_PREVIEW_URL) throw new Error('CI AI Search setup requires the local E2E Worker')

  // Playwright starts and health-checks the local Worker before globalSetup.
  // The persistent CI instance is exclusive to this E2E job, but each job has
  // a fresh D1 snapshot. Reconcile orphaned test sites and the organizations
  // whose records the write specs actually change before those specs run.
  const baseUrl = testBaseUrl()
  execFileSync('corepack', ['yarn', 'ai-search:sync', '--base-url', baseUrl, '--platform-only'], { stdio: 'inherit' })
  for (const organizationId of [E2E_DEMO_ORGANIZATION_ID, E2E_POTTERY_ORGANIZATION_ID, E2E_KIKUZUKI_ORGANIZATION_ID]) {
    execFileSync('corepack', ['yarn', 'ai-search:sync', '--base-url', baseUrl, '--organization', organizationId], { stdio: 'inherit' })
  }
}
