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
const VIDEO_FIXTURE_PATH = path.join(rootDir, 'assets', 'videos', 'hero-video.mp4')
const POSTER_FIXTURE_PATH = path.join(rootDir, 'assets', 'images', 'menu', 'chicken.png')
const evidence = {
  runId,
  baseUrl,
  connectorName,
  browserMode: 'human-controlled normal browser',
  prompts: [],
  created: {},
  cleanup: {},
}

function required(value, name) {
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function parseSummary(value, label) {
  if (typeof value !== 'string' || !value) throw new Error(`${label} telemetry is missing result_summary_json.`)
  const parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} telemetry result must be an object.`)
  return parsed
}

function sanitizeText(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:code|token|secret|state)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 8_000)
}

async function telemetry(toolName, since) {
  const url = new URL('/api/dev/mcp-telemetry', baseUrl)
  url.searchParams.set('since', since)
  url.searchParams.set('tool_name', toolName)
  url.searchParams.set('mcp_surface', 'client')
  url.searchParams.set('limit', '20')
  const response = await fetch(url, { headers: { 'x-dev-route-secret': devSecret } })
  if (!response.ok) throw new Error(`Telemetry returned ${response.status}: ${sanitizeText(await response.text())}`)
  const payload = await response.json()
  if (!Array.isArray(payload.events)) throw new Error('Telemetry response is missing its events array.')
  return payload.events
}

async function readTelemetryEvent(toolName, since, expected = {}) {
  const valueAtPath = (value, path) => path.split('.').reduce((current, key) => current?.[key], value)
  const events = await telemetry(toolName, since)
  const event = events.find((candidate) => {
    if (candidate.tool_name !== toolName) return false
    if (expected.siteId && candidate.site_id !== expected.siteId) return false
    const args = parseSummary(candidate.arguments_summary_json, `${toolName} arguments`)
    if (expected.arguments && !Object.entries(expected.arguments).every(([key, value]) => JSON.stringify(valueAtPath(args, key)) === JSON.stringify(value))) return false
    return true
  })
  if (!event) throw new Error(`No ${toolName} telemetry event matched the completed ChatGPT action.`)
  if (event.status !== 'success') throw new Error(`${toolName} telemetry status was ${event.status}: ${String(event.error_message)}`)
  return event
}

async function waitForManualAction(rl, instruction) {
  const response = await rl.question(`${instruction}\nPress Enter after it succeeds, or type the ChatGPT error and press Enter: `)
  if (response.trim()) throw new Error(`ChatGPT reported: ${sanitizeText(response.trim())}`)
}

async function runPrompt(rl, title, prompt, expectedTool, expected = {}) {
  const since = new Date(Date.now() - 1_000).toISOString()
  console.log(`\n# ${title}`)
  console.log(`Expected tool: ${expectedTool}`)
  console.log(`\n${prompt}\n`)
  await waitForManualAction(rl, 'Copy that exact prompt into the normal ChatGPT browser chat with the connector enabled.')
  const event = await readTelemetryEvent(expectedTool, since, expected)
  evidence.prompts.push({ title, prompt, expectedTool, event })
  console.log(`# Verified ${expectedTool} from sanitized server telemetry.`)
  return event
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
    headers: {
      cookie,
      'content-type': 'application/json',
      'mcp-protocol-version': MCP_VERSION,
      'mcp-method': 'tools/call',
      'mcp-name': name,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: `chatgpt-cleanup-${Date.now()}`, method: 'tools/call', params: { name, arguments: args } }),
  })
  const body = await response.json()
  if (!response.ok || body?.result?.isError) throw new Error(`${name} cleanup failed (${response.status}): ${sanitizeText(JSON.stringify(body))}`)
  const structuredContent = body?.result?.structuredContent
  if (!structuredContent || typeof structuredContent !== 'object' || Array.isArray(structuredContent)) {
    throw new Error(`${name} cleanup did not return canonical structuredContent.`)
  }
  return structuredContent
}

async function main() {
  required(baseUrl, 'MCP_BASE_URL')
  required(devSecret, 'E2E_DEV_ROUTE_SECRET')
  if (!process.stdin.isTTY) throw new Error('The actual ChatGPT gate requires an interactive terminal and a human-controlled normal browser.')
  fs.mkdirSync(artifactDir, { recursive: true })

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  let userId = ''
  let postId = ''
  let blogId = ''
  let videoAssetId = ''
  let primaryError
  const cleanupErrors = []

  try {
    console.log('\n# Actual ChatGPT connector gate — normal browser required')
    console.log(`Connector URL: ${baseUrl}/api/mcp`)
    console.log('Create or refresh the Developer Mode connector with that exact URL, then complete login and consent in your regular browser.')
    console.log('The local email/password account is provisioned from LOCAL_MCP_TEST_EMAIL and LOCAL_MCP_TEST_PASSWORD.')
    console.log('Open a new ChatGPT chat and enable the connector. This script never launches or controls the browser.')
    await waitForManualAction(rl, 'Finish connector authorization and open the new connector-enabled chat.')

    const listEvent = await runPrompt(rl, 'List sites', `Use ${connectorName} now. List the KrabiClaw sites I can access.`, 'list_sites')
    userId = required(listEvent.user_id, 'list_sites telemetry user_id')
    const listed = parseSummary(listEvent.result_summary_json, 'list_sites').sites
    if (!Array.isArray(listed) || !listed.some(site => site?.id === siteId)) throw new Error(`Site ${siteId} was not returned by list_sites.`)

    const suffix = Date.now()
    const createEvent = await runPrompt(rl, 'Create post', `Using KrabiClaw site_id ${siteId}, create a standard post titled "ChatGPT MCP gate ${suffix}" with body "Created through the real ChatGPT connector gate." Do it now.`, 'create_post', { siteId, arguments: { site_id: siteId } })
    const createdPost = parseSummary(createEvent.result_summary_json, 'create_post')
    postId = createdPost.id
    evidence.created.post = { id: postId, slug: createdPost.slug }
    if (!postId || !createdPost.slug) throw new Error('create_post telemetry did not contain a post id and slug.')

    await runPrompt(rl, 'Read post', `Read back the KrabiClaw post_id ${postId} from site_id ${siteId}.`, 'get_post', { siteId, arguments: { site_id: siteId, post_id: postId } })
    const publicPost = await fetch(`${baseUrl}/api/public/sites/${siteId}/posts/${encodeURIComponent(createdPost.slug)}`)
    if (!publicPost.ok) throw new Error(`Created post was not public: ${publicPost.status}`)

    const publishEvent = await runPrompt(rl, 'Publish site and Facebook', `I explicitly confirm publication. Publish KrabiClaw post_id ${postId} on site_id ${siteId} to both site and facebook now. A disconnected Facebook channel should be reported as skipped while the site remains published.`, 'publish_post', { siteId, arguments: { site_id: siteId, post_id: postId, channels: ['site', 'facebook'] } })
    const publishResult = parseSummary(publishEvent.result_summary_json, 'publish_post')
    if (publishResult.channel_outcomes?.site?.status !== 'published' || publishResult.channel_outcomes?.facebook?.status !== 'skipped') {
      throw new Error(`Unexpected combined publication result: ${sanitizeText(publishEvent.result_summary_json)}`)
    }

    const blogEvent = await runPrompt(rl, 'Create block blog', `On KrabiClaw site_id ${siteId}, create a draft blog post titled "ChatGPT block gate ${suffix}" using content_blocks exactly: one heading block with text "Connector block heading", then one markdown block with markdown "Connector **block** body."`, 'create_blog_post', { siteId, arguments: { site_id: siteId } })
    const createdBlog = parseSummary(blogEvent.result_summary_json, 'create_blog_post')
    blogId = createdBlog.post?.id
    evidence.created.blog = { id: blogId }
    if (!blogId) throw new Error('create_blog_post telemetry did not contain a blog id.')

    const blogRead = await runPrompt(rl, 'Read block blog', `Read KrabiClaw blog post_id ${blogId} on site_id ${siteId} and report its content block types.`, 'get_blog_post', { siteId, arguments: { site_id: siteId, post_id: blogId } })
    const blogResult = parseSummary(blogRead.result_summary_json, 'get_blog_post')
    const blocks = blogResult.post?.content_blocks
    if (!Array.isArray(blocks) || !JSON.stringify(blocks).includes('Connector block heading')) throw new Error('get_blog_post did not return the canonical block content.')

    const fixturePath = path.join(artifactDir, 'hero-video.mp4')
    const posterFixturePath = path.join(artifactDir, 'hero-video-poster.png')
    fs.copyFileSync(VIDEO_FIXTURE_PATH, fixturePath)
    fs.copyFileSync(POSTER_FIXTURE_PATH, posterFixturePath)
    evidence.videoFixture = { video: fixturePath, poster: posterFixturePath }

    const uploadSince = new Date(Date.now() - 1_000).toISOString()
    console.log(`\n# Upload video\nAttach both fixtures in ChatGPT with the paperclip, then ask it to upload the video with the image as its poster:\n${fixturePath}\n${posterFixturePath}\n`)
    await waitForManualAction(rl, 'Complete the ChatGPT attachment upload.')
    const uploadEvent = await readTelemetryEvent('upload_user_media', uploadSince, { siteId, arguments: { site_id: siteId } })
    evidence.prompts.push({ title: 'Video attachment upload', prompt: `Upload ${fixturePath} with poster ${posterFixturePath} as ChatGPT attachments`, expectedTool: 'upload_user_media', event: uploadEvent })
    const uploadedVideo = parseSummary(uploadEvent.result_summary_json, 'upload_user_media')
    videoAssetId = uploadedVideo.asset_id
    const publicUrl = uploadedVideo.public_url
    const thumbnailUrl = uploadedVideo.thumbnail_url
    evidence.created.video = { assetId: videoAssetId, publicUrl, thumbnailUrl }
    if (!videoAssetId || uploadedVideo.status !== 'active') throw new Error('Attachment upload did not return an active video asset.')
    if (!publicUrl || !(await fetch(publicUrl)).ok) throw new Error('Attachment video public URL did not return 200.')
    if (!thumbnailUrl || !(await fetch(thumbnailUrl)).ok) throw new Error('Attachment poster public URL did not return 200.')

    await runPrompt(rl, 'Assign uploaded video', `I explicitly confirm this change. Assign KrabiClaw video asset_id ${videoAssetId} as the homepage hero video for site_id ${siteId} now.`, 'set_media', { siteId, arguments: { site_id: siteId, target_type: 'home_hero', asset_ids: [videoAssetId] } })

    console.log(`# Actual ChatGPT connector behavior passed. Cleaning up created content...`)
  } catch (error) {
    primaryError = error
    evidence.error = sanitizeText(error instanceof Error ? error.stack ?? error.message : error)
  } finally {
    rl.close()
    if (userId && siteId) {
      try {
        const cookie = await cleanupSession()
        if (videoAssetId) {
          try {
            await mcpCall(cookie, 'set_media', { site_id: siteId, target_type: 'home_hero', asset_ids: [] })
            await mcpCall(cookie, 'delete_media_asset', { site_id: siteId, asset_id: videoAssetId })
            evidence.cleanup.video = 'cleared and deleted'
          } catch (error) {
            cleanupErrors.push(error)
          }
        }
        if (blogId) {
          try {
            await mcpCall(cookie, 'delete_blog_post', { site_id: siteId, post_id: blogId })
            evidence.cleanup.blog = 'deleted'
          } catch (error) {
            cleanupErrors.push(error)
          }
        }
        if (postId) {
          try {
            await mcpCall(cookie, 'delete_post', { site_id: siteId, post_id: postId })
            evidence.cleanup.post = 'deleted'
          } catch (error) {
            cleanupErrors.push(error)
          }
        }
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError)
      }
    }
    if (cleanupErrors.length) {
      evidence.cleanup.errors = cleanupErrors.map(error => sanitizeText(error instanceof Error ? error.message : error))
    }
    fs.writeFileSync(path.join(artifactDir, 'evidence.json'), JSON.stringify(evidence, null, 2))
  }

  const failures = [...(primaryError ? [primaryError] : []), ...cleanupErrors]
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'ChatGPT gate and cleanup failed.')

  console.log(`# Actual ChatGPT connector gate passed. Evidence: ${artifactDir}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  console.error(`ChatGPT evidence: ${artifactDir}`)
  process.exit(1)
})
