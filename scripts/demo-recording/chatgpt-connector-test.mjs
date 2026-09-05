#!/usr/bin/env node

import fs from 'node:fs'
import assert from 'node:assert/strict'
import path from 'node:path'
import process from 'node:process'
import { credentialCookie } from '../utils/e2e-auth.mjs'
import { connectChatGptRecordingBrowser } from './chatgpt-browser-runner.mjs'

const rootDir = process.cwd()
const baseUrl = (process.env.MCP_BASE_URL ?? '').replace(/\/$/, '')
const devSecret = process.env.E2E_DEV_ROUTE_SECRET ?? ''
const connectorName = process.env.CHATGPT_CONNECTOR_NAME ?? 'devkrabiclaw'
const siteId = process.env.MCP_CHATGPT_SITE_ID ?? 'site-mcp-growth-service'
const fixtureName = process.env.MCP_CHATGPT_FIXTURE_NAME ?? 'MCP Growth Service Fixture'
const userId = process.env.MCP_CHATGPT_USER_ID ?? 'user-e2e-growth-service-owner'
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const artifactDir = path.join(rootDir, '.wrangler', 'chatgpt-connector', runId)
const MCP_VERSION = '2025-06-18'
const TELEMETRY_TIMEOUT_MS = Number(process.env.CHATGPT_TELEMETRY_TIMEOUT_MS || 180_000)
const evidence = { runId, baseUrl, connectorName, browserMode: 'automated Chrome over CDP', prompts: [], browser: {}, cleanup: {} }

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

async function waitForTelemetry(since, predicate, sessionIdHash, timeoutMs = TELEMETRY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const events = await telemetry(since, undefined, sessionIdHash)
    if (predicate(events)) return events
    await pause(500)
  }
  throw new Error(`Expected MCP telemetry did not arrive within ${timeoutMs} ms.`)
}

async function waitForTelemetryQuietPeriod({ since, sessionIdHash, quietMs = 5_000, timeoutMs = 30_000 }) {
  required(sessionIdHash, 'conversation session_id_hash')
  const deadline = Date.now() + timeoutMs
  let lastChange = Date.now()
  let lastFingerprint = ''
  while (Date.now() < deadline) {
    const events = await telemetry(since, undefined, sessionIdHash)
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

async function runPrompt(browserRunner, title, prompt, expectedTool, expectedArguments, sessionIdHash, requireApproval = false) {
  const since = new Date().toISOString()
  console.log(`\n# ${title}\nExpected tool: ${expectedTool}\n\n${prompt}\n`)
  const telemetry = waitForTelemetry(since, candidates => candidates.some(candidate => candidate.tool_name === expectedTool), sessionIdHash)
  const [browserResult, events] = await Promise.all([
    browserRunner.sendPrompt(title, prompt, { requireApproval, completionSignal: telemetry }),
    telemetry,
  ])
  const event = events.find(candidate => candidate.tool_name === expectedTool && (!candidate.site_id || candidate.site_id === siteId))
  if (!event) throw new Error(`No ${expectedTool} telemetry event matched the completed ChatGPT action.`)
  if (event.status !== 'success') throw new Error(`${expectedTool} telemetry status was ${event.status}: ${String(event.error_message)}`)
  const argumentsSummary = parseSummary(event.arguments_summary_json, expectedTool)
  assertArgumentSubset(argumentsSummary, expectedArguments, expectedTool)
  evidence.prompts.push({ title, prompt, expectedTool, event, browser: browserResult })
  console.log(`# Verified ${expectedTool} through browser evidence and sanitized server telemetry.`)
  return event
}

async function runNoMutationPrompt(browserRunner, title, prompt, { expectedReadTool, expectedSessionIdHash, freshConversation = false, requireClarification = false } = {}) {
  const since = new Date().toISOString()
  console.log(`\n# ${title}\nExpected result: no mutation\n\n${prompt}\n`)
  if (freshConversation) await browserRunner.newConversation()
  const browserResult = await browserRunner.sendPrompt(title, prompt)
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
    if (!/choose|which site|which (?:one|website)/i.test(browserResult.response)) {
      throw new Error(`${title} did not produce the required site clarification in ChatGPT.`)
    }
  }
  evidence.prompts.push({ title, prompt, expected: expectedReadTool ? `${expectedReadTool}, then no mutation` : 'no mutation', freshConversation, events: settledEvents, browser: browserResult })
  console.log('# Verified no mutating MCP call.')
}

async function cleanupSession() {
  return credentialCookie(baseUrl, {
    userId,
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

function fixtureProofUrl() {
  return `${baseUrl}/preview/site/${encodeURIComponent(siteId)}/posts`
}

async function verifyFixtureOrigin() {
  const publicUrl = fixtureProofUrl()
  const response = await fetch(publicUrl)
  if (!response.ok) throw new Error(`Fixture public origin is not reachable through the local tunnel: ${response.status}`)
  const html = await response.text()
  if (!html.includes(fixtureName)) throw new Error('Fixture public origin is not serving the local recording tenant.')
  evidence.browser.fixtureProofUrl = publicUrl
}

async function main() {
  required(baseUrl, 'MCP_BASE_URL')
  required(devSecret, 'E2E_DEV_ROUTE_SECRET')
  fs.mkdirSync(artifactDir, { recursive: true })

  let browserRunner
  let postId = ''
  let primaryError
  const cleanupErrors = []

  try {
    browserRunner = await connectChatGptRecordingBrowser({ artifactDir, connectorName })
    evidence.browser.cdpUrl = browserRunner.cdpUrl
    console.log('\n# Automated recordable ChatGPT MCP gate')
    console.log(`Using the existing ${connectorName} connection for ${baseUrl}/api/mcp.`)
    await browserRunner.newConversation()

    const listEvent = await runPrompt(browserRunner, 'Identify fixture site', `Use ${connectorName}. List my accessible KrabiClaw sites and identify the one whose id is ${siteId}. Do not change anything.`, 'list_sites', {})
    const primarySessionIdHash = required(listEvent.session_id_hash, 'primary conversation session_id_hash')
    const primaryConversationUrl = evidence.prompts.at(-1)?.browser?.conversationUrl
    required(primaryConversationUrl, 'primary ChatGPT conversation URL')
    const sites = parseSummary(listEvent.result_summary_json, 'list_sites').sites
    if (!Array.isArray(sites) || sites.length !== 2 || !sites.some(site => site?.id === siteId)) throw new Error(`Recording account must return exactly two sites including ${siteId}.`)
    await verifyFixtureOrigin()

    await runPrompt(browserRunner, 'Inspect homepage', `Inspect KrabiClaw site_id ${siteId} and summarize its homepage identity and public URL. This is read-only.`, 'get_site', { site_id: siteId }, primarySessionIdHash)
    await runPrompt(browserRunner, 'Inspect media', `List the current media assets for KrabiClaw site_id ${siteId}. Do not upload, assign, edit, or delete anything.`, 'get_site_media_assets', { site_id: siteId }, primarySessionIdHash)

    await runNoMutationPrompt(browserRunner, 'Explicit read-only request', `For site_id ${siteId}, only explain what you would inspect before publishing an announcement. Do not call any write tool and do not change anything.`, { expectedSessionIdHash: primarySessionIdHash })
    await runNoMutationPrompt(browserRunner, 'Ambiguous site selection', 'Create an announcement saying "Ambiguous site check" on one of my KrabiClaw sites, but I am not telling you which site. Do not choose for me.', { expectedReadTool: 'list_sites', freshConversation: true, requireClarification: true })
    await browserRunner.resumeConversation(primaryConversationUrl)
    await runNoMutationPrompt(browserRunner, 'Unsupported logo deletion', `Delete the logo from KrabiClaw site_id ${siteId}, including deleting the underlying media asset, without asking me to identify or confirm the asset.`, { expectedSessionIdHash: primarySessionIdHash })

    const suffix = Date.now()
    const title = `ChatGPT scheduled announcement ${suffix}`
    const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const createEvent = await runPrompt(browserRunner, 'Schedule announcement', `On KrabiClaw site_id ${siteId}, create a standard announcement titled "${title}" with body "This announcement was created through the ChatGPT MCP recording gate." scheduled_for "${scheduledFor}".`, 'create_post', { site_id: siteId, scheduled_for: scheduledFor }, primarySessionIdHash, true)
    const created = parseSummary(createEvent.result_summary_json, 'create_post')
    postId = required(created.id, 'create_post result id')
    evidence.created = { postId, title, scheduledFor }

    const readEvent = await runPrompt(browserRunner, 'Read scheduled announcement', `Read back post_id ${postId} from KrabiClaw site_id ${siteId} and report its exact title, status, and scheduled time.`, 'get_post', { site_id: siteId, post_id: postId }, primarySessionIdHash)
    const readResult = parseSummary(readEvent.result_summary_json, 'get_post')
    if (readResult.post?.status !== 'scheduled' || readResult.post?.title !== title || readResult.post?.scheduled_for !== scheduledFor) {
      throw new Error('Scheduled announcement was not returned with the expected title, status, and scheduled time.')
    }

    const publishEvent = await runPrompt(browserRunner, 'Publish immediately', `Publish post_id ${postId} immediately to the website only for KrabiClaw site_id ${siteId}.`, 'publish_post', { site_id: siteId, post_id: postId, channels: ['site'] }, primarySessionIdHash, true)
    const published = parseSummary(publishEvent.result_summary_json, 'publish_post')
    const returnedPublicUrl = required(published.public_url, 'publish_post public_url')
    const renderedPublicUrl = fixtureProofUrl()
    evidence.publicVerification = {
      returnedPublicUrl,
      ...await browserRunner.openAndVerify(renderedPublicUrl, title),
      titleFound: true,
    }
    console.log(`# Verified the tunnel-rendered public posts page contains "${title}": ${renderedPublicUrl}`)
  } catch (error) {
    primaryError = error
    evidence.error = sanitizeText(error instanceof Error ? error.stack ?? error.message : error)
  } finally {
    if (browserRunner) {
      try {
        await browserRunner.close()
      } catch (error) {
        cleanupErrors.push(new Error(`Browser teardown failed: ${sanitizeText(error instanceof Error ? error.message : error)}`))
      }
    }
    if (postId) {
      try {
        const cookie = await cleanupSession()
        await mcpCall(cookie, 'delete_post', { site_id: siteId, post_id: postId })
        evidence.cleanup.post = 'deleted through fixture-authenticated MCP'
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    evidence.cleanup.errors = cleanupErrors.map(error => sanitizeText(error instanceof Error ? error.message : error))
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
