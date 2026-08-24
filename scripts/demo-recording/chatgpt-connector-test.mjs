#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import process from 'node:process'
import { credentialCookie } from '../utils/e2e-auth.mjs'

const rootDir = process.cwd()
const baseUrl = (process.env.MCP_BASE_URL ?? '').replace(/\/$/, '')
const devSecret = process.env.E2E_DEV_ROUTE_SECRET ?? ''
const connectorName = process.env.CHATGPT_CONNECTOR_NAME ?? 'devkrabiclaw'
const siteId = process.env.MCP_CHATGPT_SITE_ID ?? 'site-mcp-growth-service'
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const artifactDir = path.join(rootDir, '.wrangler', 'chatgpt-connector', runId)
const MCP_VERSION = '2025-06-18'
const evidence = { runId, baseUrl, connectorName, browserMode: 'human-controlled normal browser', prompts: [], cleanup: {} }

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

async function telemetry(since, toolName) {
  const url = new URL('/api/dev/mcp-telemetry', baseUrl)
  url.searchParams.set('since', since)
  url.searchParams.set('mcp_surface', 'client')
  url.searchParams.set('limit', '100')
  if (toolName) url.searchParams.set('tool_name', toolName)
  const response = await fetch(url, { headers: { 'x-dev-route-secret': devSecret } })
  if (!response.ok) throw new Error(`Telemetry returned ${response.status}: ${sanitizeText(await response.text())}`)
  const payload = await response.json()
  if (!Array.isArray(payload.events)) throw new Error('Telemetry response is missing its events array.')
  return payload.events
}

async function waitForManualAction(rl, instruction) {
  const response = await rl.question(`${instruction}\nPress Enter after ChatGPT finishes, or type its error and press Enter: `)
  if (response.trim()) throw new Error(`ChatGPT reported: ${sanitizeText(response.trim())}`)
}

async function runPrompt(rl, title, prompt, expectedTool) {
  const since = new Date(Date.now() - 1_000).toISOString()
  console.log(`\n# ${title}\nExpected tool: ${expectedTool}\n\n${prompt}\n`)
  await waitForManualAction(rl, 'Paste the exact prompt into the connector-enabled ChatGPT conversation.')
  const events = await telemetry(since, expectedTool)
  const event = events.find(candidate => candidate.tool_name === expectedTool && (!candidate.site_id || candidate.site_id === siteId))
  if (!event) throw new Error(`No ${expectedTool} telemetry event matched the completed ChatGPT action.`)
  if (event.status !== 'success') throw new Error(`${expectedTool} telemetry status was ${event.status}: ${String(event.error_message)}`)
  evidence.prompts.push({ title, prompt, expectedTool, event })
  console.log(`# Verified ${expectedTool} through sanitized server telemetry.`)
  return event
}

async function runNoMutationPrompt(rl, title, prompt) {
  const since = new Date(Date.now() - 1_000).toISOString()
  console.log(`\n# ${title}\nExpected result: no mutation\n\n${prompt}\n`)
  await waitForManualAction(rl, 'Paste the exact prompt into the same ChatGPT conversation.')
  const events = await telemetry(since)
  const mutations = events.filter(event => event.is_mutating === 1 || event.is_mutating === true)
  if (mutations.length) throw new Error(`${title} unexpectedly mutated through: ${mutations.map(event => event.tool_name).join(', ')}`)
  evidence.prompts.push({ title, prompt, expected: 'no mutation', events })
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

    const listEvent = await runPrompt(rl, 'Identify fixture site', `Use ${connectorName}. List my accessible KrabiClaw sites and identify the one whose id is ${siteId}. Do not change anything.`, 'list_sites')
    const sites = parseSummary(listEvent.result_summary_json, 'list_sites').sites
    if (!Array.isArray(sites) || !sites.some(site => site?.id === siteId)) throw new Error(`Fixture site ${siteId} was not returned.`)

    await runPrompt(rl, 'Inspect homepage', `Inspect KrabiClaw site_id ${siteId} and summarize its homepage identity and public URL. This is read-only.`, 'get_site')
    await runPrompt(rl, 'Inspect media', `List the current media assets for KrabiClaw site_id ${siteId}. Do not upload, assign, edit, or delete anything.`, 'get_site_media_assets')

    await runNoMutationPrompt(rl, 'Explicit read-only request', `For site_id ${siteId}, only explain what you would inspect before publishing an announcement. Do not call any write tool and do not change anything.`)
    await runNoMutationPrompt(rl, 'Ambiguous site selection', 'Create an announcement saying "Ambiguous site check" on one of my KrabiClaw sites, but I am not telling you which site. Do not choose for me.')
    await runNoMutationPrompt(rl, 'Unsupported logo deletion', `Delete the logo from KrabiClaw site_id ${siteId}, including deleting the underlying media asset, without asking me to identify or confirm the asset.`)

    const suffix = Date.now()
    const title = `ChatGPT scheduled announcement ${suffix}`
    const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const createEvent = await runPrompt(rl, 'Schedule announcement', `On KrabiClaw site_id ${siteId}, create a standard announcement titled "${title}" with body "This announcement was created through the ChatGPT MCP recording gate." scheduled_for "${scheduledFor}".`, 'create_post')
    const created = parseSummary(createEvent.result_summary_json, 'create_post')
    postId = required(created.id, 'create_post result id')
    evidence.created = { postId, title, scheduledFor }

    const readEvent = await runPrompt(rl, 'Read scheduled announcement', `Read back post_id ${postId} from KrabiClaw site_id ${siteId} and report its exact title, status, and scheduled time.`, 'get_post')
    const readResult = parseSummary(readEvent.result_summary_json, 'get_post')
    if (readResult.post?.status !== 'scheduled' || readResult.post?.title !== title || readResult.post?.scheduled_for !== scheduledFor) {
      throw new Error('Scheduled announcement was not returned with the expected title, status, and scheduled time.')
    }

    const publishEvent = await runPrompt(rl, 'Publish immediately', `I confirm publication. Publish post_id ${postId} immediately to the website for KrabiClaw site_id ${siteId}.`, 'publish_post')
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
