#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import process from 'node:process'

const rootDir = process.cwd()
const baseUrl = (process.env.MCP_BASE_URL || process.env.BETTER_AUTH_URL || '').replace(/\/$/, '')
const devSecret = process.env.E2E_DEV_ROUTE_SECRET || ''
const connectorName = process.env.CHATGPT_CONNECTOR_NAME || 'devkrabiclaw'
const fixtureUserId = process.env.MCP_CHATGPT_USER_ID || 'user-mcp-managed'
const siteId = process.env.MCP_CHATGPT_SITE_ID || 'site-mcp-managed'
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const artifactDir = path.join(rootDir, '.wrangler', 'chatgpt-connector', runId)
const MCP_VERSION = '2025-11-25'
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

function parseSummary(value) {
  if (typeof value !== 'string' || !value) return {}
  try { return JSON.parse(value) } catch { return {} }
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
  return (await response.json()).events || []
}

async function pollTelemetry(toolName, since, expected = {}, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const events = await telemetry(toolName, since)
    const event = events.find((candidate) => {
      if (candidate.tool_name !== toolName) return false
      if (expected.siteId && candidate.site_id !== expected.siteId) return false
      const args = parseSummary(candidate.arguments_summary_json)
      if (expected.arguments && !Object.entries(expected.arguments).every(([key, value]) => JSON.stringify(args[key]) === JSON.stringify(value))) return false
      return true
    })
    if (event) {
      if (event.status !== 'success') throw new Error(`${toolName} telemetry status was ${event.status}: ${event.error_message || 'unknown error'}`)
      return event
    }
    await new Promise(resolve => setTimeout(resolve, 1_500))
  }
  throw new Error(`Timed out waiting for ChatGPT to call ${toolName}.`)
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
  const event = await pollTelemetry(expectedTool, since, expected)
  evidence.prompts.push({ title, prompt, expectedTool, event })
  console.log(`# Verified ${expectedTool} from sanitized server telemetry.`)
  return event
}

async function devSession(userId) {
  const url = new URL('/api/dev/login', baseUrl)
  url.searchParams.set('userId', userId)
  const response = await fetch(url, { headers: { 'x-dev-route-secret': devSecret }, redirect: 'manual' })
  const cookie = response.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error(`Dev login cleanup session failed with ${response.status}.`)
  return cookie
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
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.result?.isError) throw new Error(`${name} cleanup failed (${response.status}): ${sanitizeText(JSON.stringify(body))}`)
  return body?.result?.structuredContent || {}
}

async function main() {
  required(baseUrl, 'MCP_BASE_URL')
  required(devSecret, 'E2E_DEV_ROUTE_SECRET')
  if (!process.stdin.isTTY) throw new Error('The actual ChatGPT gate requires an interactive terminal and a human-controlled normal browser.')
  fs.mkdirSync(artifactDir, { recursive: true })

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  let userId = fixtureUserId
  let postId = ''
  let blogId = ''
  let videoAssetId = ''

  try {
    console.log('\n# Actual ChatGPT connector gate — normal browser required')
    console.log(`Connector URL: ${baseUrl}/api/mcp`)
    console.log('Create or refresh the Developer Mode connector with that exact URL, then complete login and consent in your regular browser.')
    console.log('The local email/password account is provisioned from LOCAL_MCP_TEST_EMAIL and LOCAL_MCP_TEST_PASSWORD in .env.')
    console.log('Open a new ChatGPT chat and enable the connector. This script never launches or controls the browser.')
    await waitForManualAction(rl, 'Finish connector authorization and open the new connector-enabled chat.')

    const listEvent = await runPrompt(rl, 'List sites', `Use ${connectorName} now. List the KrabiClaw sites I can access.`, 'list_sites')
    userId = listEvent.user_id || fixtureUserId
    const listed = parseSummary(listEvent.result_summary_json).sites || []
    if (!listed.some(site => (site.id || site.site_id) === siteId)) throw new Error(`Site ${siteId} was not returned by list_sites.`)

    const suffix = Date.now()
    const createEvent = await runPrompt(rl, 'Create post', `Using KrabiClaw site_id ${siteId}, create a standard post titled "ChatGPT MCP gate ${suffix}" with body "Created through the real ChatGPT connector gate." Do it now.`, 'create_post', { siteId, arguments: { site_id: siteId } })
    const createdPost = parseSummary(createEvent.result_summary_json)
    postId = createdPost.id
    evidence.created.post = { id: postId, slug: createdPost.slug }
    if (!postId || !createdPost.slug) throw new Error('create_post telemetry did not contain a post id and slug.')

    await runPrompt(rl, 'Read post', `Read back the KrabiClaw post_id ${postId} from site_id ${siteId}.`, 'get_post', { siteId, arguments: { site_id: siteId, post_id: postId } })
    const publicPost = await fetch(`${baseUrl}/api/public/sites/${siteId}/posts/${encodeURIComponent(createdPost.slug)}`)
    if (!publicPost.ok) throw new Error(`Created post was not public: ${publicPost.status}`)

    const publishEvent = await runPrompt(rl, 'Publish site and Facebook', `I explicitly confirm publication. Publish KrabiClaw post_id ${postId} on site_id ${siteId} to both site and facebook now. A disconnected Facebook channel should be reported as skipped while the site remains published.`, 'publish_post', { siteId, arguments: { site_id: siteId, post_id: postId, channels: ['site', 'facebook'] } })
    const publishResult = parseSummary(publishEvent.result_summary_json)
    if (publishResult.channel_outcomes?.site?.status !== 'published' || publishResult.channel_outcomes?.facebook?.status !== 'skipped') {
      throw new Error(`Unexpected combined publication result: ${sanitizeText(publishEvent.result_summary_json)}`)
    }

    const blogEvent = await runPrompt(rl, 'Create block blog', `On KrabiClaw site_id ${siteId}, create a draft blog post titled "ChatGPT block gate ${suffix}" using content_blocks exactly: one heading block with text "Connector block heading", then one markdown block with markdown "Connector **block** body." Do not use a legacy body field.`, 'create_blog_post', { siteId, arguments: { site_id: siteId } })
    const createdBlog = parseSummary(blogEvent.result_summary_json)
    blogId = createdBlog.id
    evidence.created.blog = { id: blogId }
    if (!blogId) throw new Error('create_blog_post telemetry did not contain a blog id.')

    const blogRead = await runPrompt(rl, 'Read block blog', `Read KrabiClaw blog post_id ${blogId} on site_id ${siteId} and report its content block types.`, 'get_blog_post', { siteId, arguments: { site_id: siteId, post_id: blogId } })
    const blogResult = parseSummary(blogRead.result_summary_json)
    const blocks = blogResult.post?.content_document?.blocks || blogResult.content_document?.blocks || blogResult.content_blocks || []
    if (!JSON.stringify(blocks).includes('Connector block heading')) throw new Error('get_blog_post did not return the canonical block content.')

    const fixtureResponse = await fetch(`${baseUrl}/api/mcp-test/tiny-video`)
    if (!fixtureResponse.ok) throw new Error(`Tiny video fixture returned ${fixtureResponse.status}.`)
    const fixturePath = path.join(artifactDir, 'tiny-video.mp4')
    fs.writeFileSync(fixturePath, Buffer.from(await fixtureResponse.arrayBuffer()))
    evidence.videoFixture = fixturePath

    await runPrompt(rl, 'Open video widget', `For KrabiClaw site_id ${siteId}, open the video upload widget now. Do not use an image upload tool.`, 'open_video_upload', { siteId, arguments: { site_id: siteId } })

    const uploadSince = new Date(Date.now() - 1_000).toISOString()
    console.log(`\n# Upload video\nIn the ChatGPT video widget, choose this fixture and click Upload video:\n${fixturePath}\n`)
    await waitForManualAction(rl, 'Complete the widget upload in ChatGPT.')
    const uploadEvent = await pollTelemetry('upload_user_media', uploadSince, { siteId, arguments: { site_id: siteId } })
    evidence.prompts.push({ title: 'Widget video upload', prompt: `Upload ${fixturePath} through the widget`, expectedTool: 'upload_user_media', event: uploadEvent })
    const uploadedVideo = parseSummary(uploadEvent.result_summary_json)
    videoAssetId = uploadedVideo.asset_id || uploadedVideo.assetId
    const publicUrl = uploadedVideo.public_url || uploadedVideo.publicUrl
    evidence.created.video = { assetId: videoAssetId, publicUrl }
    if (!videoAssetId || uploadedVideo.status !== 'active') throw new Error('Widget upload did not return an active video asset.')
    if (!publicUrl || !(await fetch(publicUrl)).ok) throw new Error('Widget video public URL did not return 200.')

    await runPrompt(rl, 'Assign uploaded video', `I explicitly confirm this change. Assign KrabiClaw video asset_id ${videoAssetId} as the homepage hero video for site_id ${siteId} now.`, 'set_home_hero_video', { siteId, arguments: { site_id: siteId, asset_id: videoAssetId } })

    console.log(`# Actual ChatGPT connector behavior passed. Cleaning up created content...`)
  } catch (error) {
    evidence.error = sanitizeText(error instanceof Error ? error.stack || error.message : error)
    throw error
  } finally {
    rl.close()
    if (userId && siteId) {
      try {
        const cookie = await devSession(userId)
        if (videoAssetId) {
          await mcpCall(cookie, 'clear_home_hero_video', { site_id: siteId })
          await mcpCall(cookie, 'delete_media_asset', { site_id: siteId, asset_id: videoAssetId })
          evidence.cleanup.video = 'cleared and deleted'
        }
        if (blogId) {
          await mcpCall(cookie, 'delete_blog_post', { site_id: siteId, post_id: blogId })
          evidence.cleanup.blog = 'deleted'
        }
        if (postId) {
          await mcpCall(cookie, 'delete_post', { site_id: siteId, post_id: postId })
          evidence.cleanup.post = 'deleted'
        }
      } catch (cleanupError) {
        evidence.cleanup.error = sanitizeText(cleanupError instanceof Error ? cleanupError.message : cleanupError)
      }
    }
    fs.writeFileSync(path.join(artifactDir, 'evidence.json'), JSON.stringify(evidence, null, 2))
  }

  console.log(`# Actual ChatGPT connector gate passed. Evidence: ${artifactDir}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  console.error(`ChatGPT evidence: ${artifactDir}`)
  process.exit(1)
})
