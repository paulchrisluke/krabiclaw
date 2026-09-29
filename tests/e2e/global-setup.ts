import { spawn } from 'node:child_process'
import { once } from 'node:events'

export default async function globalSetup() {
  if (process.env.PLAYWRIGHT_PREVIEW_URL) return

  // Playwright starts and health-checks config.webServer before globalSetup.
  // Reconcile the local D1 snapshot into this run's dedicated AI Search instance
  // through the same command used for production releases.
  const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000)
  const sync = spawn('corepack', ['yarn', 'ai-search:sync', '--base-url', `http://localhost:${port}`], {
    stdio: 'inherit',
    env: process.env,
  })
  const [code] = await once(sync, 'exit')
  if (code !== 0) throw new Error(`AI Search E2E bootstrap exited with code ${code}`)
}
