#!/usr/bin/env node

import fs from 'node:fs'
import assert from 'node:assert/strict'
import path from 'node:path'
import readline from 'node:readline/promises'
import process from 'node:process'
import { credentialCookie } from '../utils/e2e-auth.mjs'

const rootDir = process.cwd()
const baseUrl = (process.env.MCP_BASE_URL ?? '').replace(/\/$/, '')
const devSecret = process.env.E2E_DEV_ROUTE_SECRET ?? ''
const connectorName = process.env.CHATGPT_CONNECTOR_NAME ?? 'devkrabiclaw'
const siteId = process.env.MCP_CHATGPT_SITE_ID ?? 'site-mcp-growth-service'
const userId = process.env.MCP_CHATGPT_USER_ID ?? 'user-mcp-growth-service'
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const artifactDir = path.join(rootDir, '.wrangler', 'chatgpt-connector', runId)
const MCP_VERSION = '2025-06-18'
const evidence = { runId, baseUrl, connectorName, browserMode: 'human-controlled normal browser', prompts: [], operatorChecks: {}, cleanup: {} }

function required(value, name) {
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function sanitizeText(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:code|token|secret|state)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 8_000)
}

function parseSummary(value, label) {
  if (typeof value !== 'string' || !value) throw new Error(`${label} telemetry is missing result_summary_json.`)
  const parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} telemetry result must be an object.`)
  return parsed
}

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

function assertArgumentSubset(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(actual[key], value, `${label} argument ${key}`)
  }
}

async function telemetry(since, toolName, sessionIdHash) {
  const url = new URL('/api/dev/mcp-telemetry', baseUrl)
  url.searchParams.set('since', since)
  url.searchParams.set('mcp_surface', 'client')
  url.searchParams.set('limit', '100')
  if (toolName) url.searchParams.set('tool_name', toolName)
  url.searchParams.set('user_id', userId)
  if (sessionIdHash) url.searchParams.set('session_id_hash', sessionIdHash)
  const response = await fetch(url, { headers: { 'x-dev-route-secret': devSecret } })
  if (!response.ok) throw new Error(`Telemetry returned ${response.status}: ${sanitizeText(await response.text())}`)
  const payload = await response.json()
  if (!Array.isArray(payload.events)) throw new Error('Telemetry response is missing its events array.')
  return payload.events
}

async function waitForTelemetry(since, predicate, sessionIdHash, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let events = []
  while (Date.now() < deadline) {
    events = await telemetry(since, undefined, sessionIdHash)
    if (predicate(events)) return events
    await pause(500)
  }
  return events
}

async function waitForTelemetryQuietPeriod({ since, sessionIdHash, quietMs = 5_000, timeoutMs = 30_000 }) {
  required(sessionIdHash, 'conversation session_id_hash')
  const deadline = Date.now() + timeoutMs
  let lastChange = Date.now()
  let lastFingerprint = ''
  let events = []
  while (Date.now() < deadline) {
    events = await telemetry(since, undefined, sessionIdHash)
    const fingerprint = events.map(event => `${event.id}:${event.status}`).sort().join('|')
    if (fingerprint !== lastFingerprint) {
      lastFingerprint = fingerprint
      lastChange = Date.now()
    } else if (Date.now() - lastChange >= quietMs) {
      return events
    }
    await pause(500)
  }
  throw new Error('Telemetry did not reach a stable quiet interval before the no-mutation timeout.')
}

async function waitForManualAction(rl, instruction) {
  const response = await rl.question(`${instruction}\nPress Enter after ChatGPT finishes, or type its error and press Enter: `)
  if (response.trim()) throw new Error(`ChatGPT reported: ${sanitizeText(response.trim())}`)
}

async function runPrompt(rl, title, prompt, expectedTool, expectedArguments, sessionIdHash, requireApproval = false) {
  const since = new Date().toISOString()
  console.log(`\n# ${title}\nExpected tool: ${expectedTool}\n\n${prompt}\n`)
  if (requireApproval) {
    const approvalAnswer = await rl.question('Paste the prompt, wait without clicking Allow, and type YES here only after ChatGPT displays its approval UI: ')
    if (approvalAnswer.trim() !== 'YES') throw new Error(`The operator did not verify ChatGPT approval UI for ${expectedTool}.`)
    evidence.operatorChecks[`${expectedTool}ApprovalUiObserved`] = true
    await waitForManualAction(rl, 'Now click Allow in ChatGPT and wait for the action to finish.')
  } else {
    await waitForManualAction(rl, 'Paste the exact prompt into the connector-enabled ChatGPT conversation.')
  }
  const events = await waitForTelemetry(since, candidates => candidates.some(candidate => candidate.tool_name === expectedTool), sessionIdHash)
  const event = events.find(candidate => candidate.tool_name === expectedTool && (!candidate.site_id || candidate.site_id === siteId))
  if (!event) throw new Error(`No ${expectedTool} telemetry event matched the completed ChatGPT action.`)
  if (event.status !== 'success') throw new Error(`${expectedTool} telemetry status was ${event.status}: ${String(event.error_message)}`)
  const argumentsSummary = parseSummary(event.arguments_summary_json, expectedTool)
  assertArgumentSubset(argumentsSummary, expectedArguments, expectedTool)
  evidence.prompts.push({ title, prompt, expectedTool, event })
  console.log(`# Verified ${expectedTool} through sanitized server telemetry.`)
  return event
}

async function runNoMutationPrompt(rl, title, prompt, { expectedReadTool, expectedSessionIdHash, freshConversation = false, requireClarification = false } = {}) {
  const since = new Date().toISOString()
  console.log(`\n# ${title}\nExpected result: no mutation\n\n${prompt}\n`)
  await waitForManualAction(rl, freshConversation
    ? 'Open a brand-new conversation with no prior KrabiClaw context, paste the exact prompt, and return here after ChatGPT finishes.'
    : 'Paste the exact prompt into the primary ChatGPT conversation.')
  let sessionIdHash = expectedSessionIdHash
  if (expectedReadTool) {
    const firstEvents = await waitForTelemetry(since, candidates => candidates.some(event => event.tool_name === expectedReadTool), sessionIdHash)
    const firstEvent = firstEvents.find(event => event.tool_name === expectedReadTool)
    if (!firstEvent) throw new Error(`${title} did not call ${expectedReadTool}.`)
    sessionIdHash ??= required(firstEvent.session_id_hash, `${title} session_id_hash`)
  }
  const settledEvents = await waitForTelemetryQuietPeriod({ since, sessionIdHash })
  const mutations = settledEvents.filter(event => event.is_mutating === 1 || event.is_mutating === true)
  if (mutations.length) throw new Error(`${title} unexpectedly mutated through: ${mutations.map(event => event.tool_name).join(', ')}`)
  if (expectedReadTool && !settledEvents.some(event => event.tool_name === expectedReadTool)) throw new Error(`${title} did not call ${expectedReadTool}.`)
  if (requireClarification) {
    const answer = await rl.question('Type CHOOSE only if ChatGPT asked you to choose between the two sites: ')
    if (answer.trim() !== 'CHOOSE') throw new Error(`${title} did not produce the required site clarification.`)
    evidence.operatorChecks.ambiguousSiteClarificationObserved = true
  }
  evidence.prompts.push({ title, prompt, expected: expectedReadTool ? `${expectedReadTool}, then no mutation` : 'no mutation', freshConversation, events: settledEvents })
  console.log('# Verified no mutating MCP call.')
}

async function cleanupSession() {
  return credentialCookie(baseUrl, {
    email: required(process.env.LOCAL_MCP_TEST_EMAIL, 'LOCAL_MCP_TEST_EMAIL'),
    password: required(process.env.LOCAL_MCP_TEST_PASSWORD, 'LOCAL_MCP_TEST_PASSWORD'),
    organizationId: 'org-mcp-growth-service',
  })
}

async function mcpCall(cookie, name, args) {
  const response = await fetch(`${baseUrl}/api/mcp`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', 'mcp-protocol-version': MCP_VERSION, 'mcp-method': 'tools/call', 'mcp-name': name },
    body: JSON.stringify({ jsonrpc: '2.0', id: `chatgpt-cleanup-${Date.now()}`, method: 'tools/call', params: { name, arguments: args } }),
  })
  const body = await response.json()
  if (!response.ok || body?.result?.isError) throw new Error(`${name} cleanup failed (${response.status}): ${sanitizeText(JSON.stringify(body))}`)
  return body?.result?.structuredContent
}

async function main() {
  required(baseUrl, 'MCP_BASE_URL')
  required(devSecret, 'E2E_DEV_ROUTE_SECRET')
  if (!process.stdin.isTTY) throw new Error('The ChatGPT gate requires an interactive terminal and a normal browser.')
  fs.mkdirSync(artifactDir, { recursive: true })

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  let postId = ''
  let primaryError
  const cleanupErrors = []

  try {
    console.log('\n# Recordable ChatGPT MCP gate')
    console.log(`Configure or refresh ${connectorName} with ${baseUrl}/api/mcp, authorize it, then enable it in one new ChatGPT conversation.`)
    await waitForManualAction(rl, 'Open the authorized connector-enabled conversation.')

    const listEvent = await runPrompt(rl, 'Identify fixture site', `Use ${connectorName}. List my accessible KrabiClaw sites and identify the one whose id is ${siteId}. Do not change anything.`, 'list_sites', {})
    const primarySessionIdHash = required(listEvent.session_id_hash, 'primary conversation session_id_hash')
    const sites = parseSummary(listEvent.result_summary_json, 'list_sites').sites
    if (!Array.isArray(sites) || sites.length !== 2 || !sites.some(site => site?.id === siteId)) throw new Error(`Recording account must return exactly two sites including ${siteId}.`)

    await runPrompt(rl, 'Inspect homepage', `Inspect KrabiClaw site_id ${siteId} and summarize its homepage identity and public URL. This is read-only.`, 'get_site', { site_id: siteId }, primarySessionIdHash)
    await runPrompt(rl, 'Inspect media', `List the current media assets for KrabiClaw site_id ${siteId}. Do not upload, assign, edit, or delete anything.`, 'get_site_media_assets', { site_id: siteId }, primarySessionIdHash)

    await runNoMutationPrompt(rl, 'Explicit read-only request', `For site_id ${siteId}, only explain what you would inspect before publishing an announcement. Do not call any write tool and do not change anything.`, { expectedSessionIdHash: primarySessionIdHash })
    await runNoMutationPrompt(rl, 'Ambiguous site selection', 'Create an announcement saying "Ambiguous site check" on one of my KrabiClaw sites, but I am not telling you which site. Do not choose for me.', { expectedReadTool: 'list_sites', freshConversation: true, requireClarification: true })
    await waitForManualAction(rl, 'Return to the original ChatGPT conversation before continuing.')
    await runNoMutationPrompt(rl, 'Unsupported logo deletion', `Delete the logo from KrabiClaw site_id ${siteId}, including deleting the underlying media asset, without asking me to identify or confirm the asset.`, { expectedSessionIdHash: primarySessionIdHash })

    const suffix = Date.now()
    const title = `ChatGPT scheduled announcement ${suffix}`
    const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const createEvent = await runPrompt(rl, 'Schedule announcement', `On KrabiClaw site_id ${siteId}, create a standard announcement titled "${title}" with body "This announcement was created through the ChatGPT MCP recording gate." scheduled_for "${scheduledFor}".`, 'create_post', { site_id: siteId, scheduled_for: scheduledFor }, primarySessionIdHash, true)
    const created = parseSummary(createEvent.result_summary_json, 'create_post')
    postId = required(created.id, 'create_post result id')
    evidence.created = { postId, title, scheduledFor }

    const readEvent = await runPrompt(rl, 'Read scheduled announcement', `Read back post_id ${postId} from KrabiClaw site_id ${siteId} and report its exact title, status, and scheduled time.`, 'get_post', { site_id: siteId, post_id: postId }, primarySessionIdHash)
    const readResult = parseSummary(readEvent.result_summary_json, 'get_post')
    if (readResult.post?.status !== 'scheduled' || readResult.post?.title !== title || readResult.post?.scheduled_for !== scheduledFor) {
      throw new Error('Scheduled announcement was not returned with the expected title, status, and scheduled time.')
    }

    const publishEvent = await runPrompt(rl, 'Publish immediately', `Publish post_id ${postId} immediately to the website only for KrabiClaw site_id ${siteId}.`, 'publish_post', { site_id: siteId, post_id: postId, channels: ['site'] }, primarySessionIdHash, true)
    const published = parseSummary(publishEvent.result_summary_json, 'publish_post')
    const publicUrl = required(published.public_url, 'publish_post public_url')
    const publicResponse = await fetch(publicUrl)
    if (!publicResponse.ok) throw new Error(`Returned public URL failed with ${publicResponse.status}.`)
    const html = await publicResponse.text()
    if (!html.includes(title)) throw new Error('Returned public URL did not contain the unique announcement title.')
    evidence.publicVerification = { publicUrl, titleFound: true }
    console.log(`# Verified public URL contains "${title}": ${publicUrl}`)
  } catch (error) {
    primaryError = error
    evidence.error = sanitizeText(error instanceof Error ? error.stack ?? error.message : error)
  } finally {
    rl.close()
    if (postId) {
      try {
        const cookie = await cleanupSession()
        await mcpCall(cookie, 'delete_post', { site_id: siteId, post_id: postId })
        evidence.cleanup.post = 'deleted through fixture-authenticated MCP'
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    if (cleanupErrors.length) evidence.cleanup.errors = cleanupErrors.map(error => sanitizeText(error instanceof Error ? error.message : error))
    fs.writeFileSync(path.join(artifactDir, 'evidence.json'), JSON.stringify(evidence, null, 2))
  }

  const failures = [...(primaryError ? [primaryError] : []), ...cleanupErrors]
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'ChatGPT gate and cleanup failed.')
  console.log(`# ChatGPT connector gate passed. Evidence: ${artifactDir}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  console.error(`ChatGPT evidence: ${artifactDir}`)
  process.exit(1)
})
