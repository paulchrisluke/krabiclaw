#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

function env(name, opts = {}) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    if (opts.optional) return ''
    throw new Error(`Missing required env var: ${name}`)
  }
  return value.trim()
}

function run(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
}

function runSafe(executable, args) {
  const res = spawnSync(executable, args, { encoding: 'utf8' })
  if (res.error) throw res.error
  if (res.status !== 0) {
    const err = res.stderr || `Exit code ${res.status}`
    throw new Error(String(err))
  }
  return res.stdout
}

function d1Exec(sql) {
  runSafe('wrangler', ['d1', 'execute', 'DB', '--remote', '--json', '--command', sql])
}

function sqlEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")
}

async function smokePublic() {
  const urls = [
    `${env('CANARY_BASE_URL').replace(/\/$/, '')}/`,
    `${env('CANARY_BASE_URL').replace(/\/$/, '')}/blog`,
    `${env('CANARY_TENANT_URL').replace(/\/$/, '')}/`,
    `${env('CANARY_TENANT_URL').replace(/\/$/, '')}/experiences`,
    `${env('CANARY_TENANT_URL').replace(/\/$/, '')}/about`,
    `${env('CANARY_TENANT_URL').replace(/\/$/, '')}/contact`,
  ]

  for (const url of urls) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    let res
    try {
      res = await fetch(url, { redirect: 'follow', signal: controller.signal })
    } catch (err) {
      throw new Error(`Public smoke timed out or failed for ${url}: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      throw new Error(`Public smoke failed for ${url} (status ${res.status})`)
    }
  }
}

function main() {
  const workerName = env('ROLLBACK_WORKER_NAME', { optional: true }) || 'krabiclaw'

  if (!/^[a-zA-Z0-9_\-]+$/.test(workerName)) {
    throw new Error('Invalid ROLLBACK_WORKER_NAME (allowed: letters, numbers, -, _).')
  }
  const deploymentsJson = runSafe('wrangler', ['deployments', 'list', '--name', workerName, '--json'])
  const deployments = JSON.parse(deploymentsJson)

  const deploymentOnly = deployments
    .filter((d) => d?.annotations?.['workers/triggered_by'] === 'deployment')
    .sort((a, b) => new Date(b.created_on).getTime() - new Date(a.created_on).getTime())

  if (deploymentOnly.length < 2) {
    throw new Error('Not enough deployment history to rollback (need at least 2 deployment entries).')
  }

  const currentVersion = deploymentOnly[0]?.versions?.[0]?.version_id
  const previousVersion = deploymentOnly[1]?.versions?.[0]?.version_id

  if (!currentVersion || !previousVersion) {
    throw new Error('Unable to determine current/previous version IDs from deployment history.')
  }

  console.log(`Rolling back worker ${workerName}`)
  console.log(`Current version:  ${currentVersion}`)
  console.log(`Rollback target: ${previousVersion}`)

  runSafe('wrangler', ['versions', 'deploy', `${previousVersion}@100`, '--name', workerName, '--message', `automated rollback to ${previousVersion}`, '-y'])

  console.log('Rollback deploy succeeded. Running post-rollback smoke checks...')

  const startedAt = new Date().toISOString()

  return smokePublic()
    .then(() => {
      run('node scripts/canary-prod.mjs')
      d1Exec(`
        INSERT INTO canary_runs (id, run_type, environment, status, details_json, created_at)
        VALUES (
          'canary-rollback-${sqlEscape(randomUUID())}',
          'rollback',
          'production',
          'pass',
          '${sqlEscape(JSON.stringify({ rolled_back_to: previousVersion, checked_at: new Date().toISOString(), started_at: startedAt }))}',
          '${sqlEscape(new Date().toISOString())}'
        )
      `)
      console.log(JSON.stringify({
        status: 'pass',
        rolled_back_to: previousVersion,
      }, null, 2))
    })
}

main()
  .catch((error) => {
    try {
      d1Exec(`
        INSERT INTO canary_runs (id, run_type, environment, status, details_json, created_at)
        VALUES (
          'canary-rollback-${sqlEscape(randomUUID())}',
          'rollback',
          'production',
          'fail',
          '${sqlEscape(JSON.stringify({ failed_at: new Date().toISOString(), message: error instanceof Error ? error.message : String(error) }))}',
          '${sqlEscape(new Date().toISOString())}'
        )
      `)
    } catch (err) {
      console.error('Canary audit write failed:', err)
    }
    console.error('rollback:prod failed')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
