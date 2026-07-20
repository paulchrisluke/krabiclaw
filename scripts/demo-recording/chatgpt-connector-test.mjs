#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'

const rootDir = process.cwd()
const baseUrl = (process.env.MCP_BASE_URL || process.env.BETTER_AUTH_URL || '').replace(/\/$/, '')
const devSecret = process.env.E2E_DEV_ROUTE_SECRET || ''
const connectorName = process.env.CHATGPT_CONNECTOR_NAME || 'devkrabiclaw'
function defaultProfileDir() {
  try {
    const commonDirRaw = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: rootDir, encoding: 'utf8' }).trim()
    const commonDir = path.resolve(rootDir, commonDirRaw)
    return path.join(path.dirname(commonDir), '.playwright', 'chatgpt-profile')
  } catch {
    return path.join(rootDir, '.playwright', 'chatgpt-profile')
  }
}

const userDataDir = process.env.CHATGPT_USER_DATA_DIR || defaultProfileDir()
const chatgptUrl = process.env.CHATGPT_URL || 'https://chatgpt.com/'
const fixtureUserId = process.env.MCP_CHATGPT_USER_ID || 'user-mcp-managed'
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const artifactDir = path.join(rootDir, '.wrangler', 'chatgpt-connector', runId)
const MCP_VERSION = '2025-11-25'
const evidence = { runId, baseUrl, connectorName, prompts: [], created: {}, cleanup: {} }

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

async function waitForEnter(message) {
  if (!process.stdin.isTTY) throw new Error(message)
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try { await rl.question(`${message}\nPress Enter when ready... `) } finally { rl.close() }
}

async function findComposer(page) {
  const selectors = ['textarea', 'div[contenteditable="true"][data-lexical-editor="true"]', 'div[contenteditable="true"]']
  for (const selector of selectors) {
    const locator = page.locator(selector).last()
    if (await locator.count() && await locator.isVisible().catch(() => false)) return locator
  }
  return null
}

async function sendPrompt(page, prompt) {
  const composer = await findComposer(page)
  if (!composer) throw new Error('Could not find the ChatGPT composer.')
  await composer.click()
  await composer.fill(prompt)
  const send = page.locator('button[data-testid="send-button"], button[aria-label*="Send" i]').first()
  if (await send.count() && await send.isVisible()) await send.click()
  else await page.keyboard.press('Enter')
}

async function ensureConnector(page) {
  const menuButtons = [
    page.locator('button[data-testid="composer-tools-menu-button"]').first(),
    page.getByRole('button', { name: /tools/i }).first(),
    page.getByRole('button', { name: /add files|more/i }).first(),
  ]
  for (const button of menuButtons) {
    if (!await button.isVisible().catch(() => false)) continue
    await button.click()
    const connector = page.getByText(connectorName, { exact: true }).last()
    if (await connector.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await connector.click()
      return
    }
    await page.keyboard.press('Escape')
  }
  await waitForEnter(`Create or refresh ${connectorName} with ${baseUrl}/api/mcp, then enable it for this new chat. This is the one-time human connector step.`)
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

async function pollTelemetry(page, toolName, since, expected = {}, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const connectionError = page.getByText(/problem connecting|connection error|failed to connect/i).last()
    if (await connectionError.isVisible().catch(() => false)) {
      throw new Error(`ChatGPT reported: ${sanitizeText(await connectionError.innerText())}`)
    }
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
    await page.waitForTimeout(1_500)
  }
  throw new Error(`Timed out waiting for ChatGPT to call ${toolName}.`)
}

async function runPrompt(page, title, prompt, expectedTool, expected = {}) {
  console.log(`# ${title}: expecting ${expectedTool}`)
  const since = new Date(Date.now() - 1_000).toISOString()
  await sendPrompt(page, prompt)
  const event = await pollTelemetry(page, expectedTool, since, expected)
  evidence.prompts.push({ title, prompt, expectedTool, event })
  await page.waitForTimeout(2_000)
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

async function widgetFrame(page) {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const input = frame.locator('input[type=file]')
      if (await input.isVisible().catch(() => false)) return frame
    }
    await page.waitForTimeout(1_000)
  }
  throw new Error('The video widget did not render a file input in ChatGPT.')
}

async function collectTranscript(page) {
  const messages = page.locator('[data-message-author-role]')
  const transcript = []
  for (let index = 0; index < await messages.count(); index += 1) {
    const message = messages.nth(index)
    transcript.push({
      role: await message.getAttribute('data-message-author-role'),
      text: sanitizeText(await message.innerText().catch(() => '')),
    })
  }
  return transcript
}

async function main() {
  required(baseUrl, 'MCP_BASE_URL')
  required(devSecret, 'E2E_DEV_ROUTE_SECRET')
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.mkdirSync(artifactDir, { recursive: true })

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: process.env.CHATGPT_HEADLESS === '1',
    viewport: { width: 1440, height: 1080 },
  })
  const page = context.pages()[0] || await context.newPage()
  let userId = ''
  let siteId = process.env.MCP_CHATGPT_SITE_ID || 'site-mcp-managed'
  let postId = ''
  let blogId = ''
  let videoAssetId = ''

  try {
    const primed = await context.request.get(`${baseUrl}/api/dev/login?userId=${encodeURIComponent(fixtureUserId)}`, {
      headers: { 'x-dev-route-secret': devSecret },
      maxRedirects: 0,
    })
    if (primed.status() !== 302) throw new Error(`Could not prime local OAuth session for ${fixtureUserId}: ${primed.status()}`)

    await page.goto(chatgptUrl, { waitUntil: 'domcontentloaded' })
    if (!await findComposer(page)) {
      await waitForEnter('Sign in to ChatGPT in the persistent browser profile.')
      await page.goto(chatgptUrl, { waitUntil: 'domcontentloaded' })
    }
    await ensureConnector(page)

    const listEvent = await runPrompt(page, 'List sites', `Use ${connectorName} now. List the KrabiClaw sites I can access.`, 'list_sites')
    userId = listEvent.user_id || ''
    const listed = parseSummary(listEvent.result_summary_json).sites || []
    if (!siteId) {
      if (listed.length !== 1) throw new Error(`Set MCP_CHATGPT_SITE_ID; connector returned ${listed.length} sites.`)
      siteId = listed[0].id || listed[0].site_id
    }
    if (!listed.some(site => (site.id || site.site_id) === siteId)) throw new Error(`Configured site ${siteId} was not returned by list_sites.`)

    const suffix = Date.now()
    const createEvent = await runPrompt(page, 'Create post', `Using KrabiClaw site_id ${siteId}, create a standard post titled "ChatGPT MCP gate ${suffix}" with body "Created through the real ChatGPT connector gate." Do it now.`, 'create_post', { siteId, arguments: { site_id: siteId } })
    const createdPost = parseSummary(createEvent.result_summary_json)
    postId = createdPost.id
    evidence.created.post = { id: postId, slug: createdPost.slug }
    if (!postId) throw new Error('create_post telemetry did not contain a post id.')

    await runPrompt(page, 'Read post', `Read back the KrabiClaw post_id ${postId} from site_id ${siteId}.`, 'get_post', { siteId, arguments: { site_id: siteId, post_id: postId } })
    const publicPost = await fetch(`${baseUrl}/api/public/sites/${siteId}/posts/${encodeURIComponent(createdPost.slug)}`)
    if (!publicPost.ok) throw new Error(`Created post was not public: ${publicPost.status}`)

    const publishEvent = await runPrompt(page, 'Publish site and Facebook', `I explicitly confirm publication. Publish KrabiClaw post_id ${postId} on site_id ${siteId} to both site and facebook now. A disconnected Facebook channel should be reported as skipped while the site remains published.`, 'publish_post', { siteId, arguments: { site_id: siteId, post_id: postId, channels: ['site', 'facebook'] } })
    const publishResult = parseSummary(publishEvent.result_summary_json)
    if (publishResult.channel_outcomes?.site?.status !== 'published' || publishResult.channel_outcomes?.facebook?.status !== 'skipped') {
      throw new Error(`Unexpected combined publication result: ${sanitizeText(publishEvent.result_summary_json)}`)
    }

    const blogEvent = await runPrompt(page, 'Create block blog', `On KrabiClaw site_id ${siteId}, create a draft blog post titled "ChatGPT block gate ${suffix}" using content_blocks exactly: one heading block with text "Connector block heading", then one markdown block with markdown "Connector **block** body." Do not use a legacy body field.`, 'create_blog_post', { siteId, arguments: { site_id: siteId } })
    const createdBlog = parseSummary(blogEvent.result_summary_json)
    blogId = createdBlog.id
    evidence.created.blog = { id: blogId }
    if (!blogId) throw new Error('create_blog_post telemetry did not contain a blog id.')
    const blogRead = await runPrompt(page, 'Read block blog', `Read KrabiClaw blog post_id ${blogId} on site_id ${siteId} and report its content block types.`, 'get_blog_post', { siteId, arguments: { site_id: siteId, post_id: blogId } })
    const blogResult = parseSummary(blogRead.result_summary_json)
    const blocks = blogResult.post?.content_document?.blocks || blogResult.content_document?.blocks || blogResult.content_blocks || []
    if (JSON.stringify(blocks).includes('Connector block heading') === false) throw new Error('get_blog_post did not return the canonical block content.')

    const widgetSince = new Date(Date.now() - 1_000).toISOString()
    await sendPrompt(page, `For KrabiClaw site_id ${siteId}, open the video upload widget now. Do not use an image upload tool.`)
    await pollTelemetry(page, 'open_video_upload', widgetSince, { siteId, arguments: { site_id: siteId } })
    const frame = await widgetFrame(page)
    const fixtureResponse = await fetch(`${baseUrl}/api/mcp-test/tiny-video`)
    if (!fixtureResponse.ok) throw new Error(`Tiny video fixture returned ${fixtureResponse.status}.`)
    const fixture = Buffer.from(await fixtureResponse.arrayBuffer())
    const uploadSince = new Date(Date.now() - 1_000).toISOString()
    await frame.locator('input[type=file]').setInputFiles({ name: 'chatgpt-connector-gate.mp4', mimeType: 'video/mp4', buffer: fixture })
    await frame.getByRole('button', { name: 'Upload video' }).click()
    const uploadEvent = await pollTelemetry(page, 'upload_user_media', uploadSince, { siteId, arguments: { site_id: siteId } })
    const uploadedVideo = parseSummary(uploadEvent.result_summary_json)
    videoAssetId = uploadedVideo.asset_id || uploadedVideo.assetId
    evidence.created.video = { assetId: videoAssetId, publicUrl: uploadedVideo.public_url || uploadedVideo.publicUrl }
    if (!videoAssetId || uploadedVideo.status !== 'active') throw new Error('Widget upload did not return an active video asset.')
    if (!(await fetch(uploadedVideo.public_url || uploadedVideo.publicUrl)).ok) throw new Error('Widget video public URL did not return 200.')

    await runPrompt(page, 'Assign uploaded video', `I explicitly confirm this change. Assign KrabiClaw video asset_id ${videoAssetId} as the homepage hero video for site_id ${siteId} now.`, 'set_home_hero_video', { siteId, arguments: { site_id: siteId, asset_id: videoAssetId } })

    evidence.transcript = await collectTranscript(page)
    fs.writeFileSync(path.join(artifactDir, 'evidence.json'), JSON.stringify(evidence, null, 2))
    await page.screenshot({ path: path.join(artifactDir, 'success.png'), fullPage: true })
    console.log(`# Actual ChatGPT connector gate passed. Evidence: ${artifactDir}`)
  } catch (error) {
    evidence.error = sanitizeText(error instanceof Error ? error.stack || error.message : error)
    evidence.transcript = await collectTranscript(page).catch(() => [])
    fs.writeFileSync(path.join(artifactDir, 'evidence.json'), JSON.stringify(evidence, null, 2))
    await page.screenshot({ path: path.join(artifactDir, 'failure.png'), fullPage: true }).catch(() => {})
    throw error
  } finally {
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
      fs.writeFileSync(path.join(artifactDir, 'evidence.json'), JSON.stringify(evidence, null, 2))
    }
    await context.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  console.error(`ChatGPT evidence: ${artifactDir}`)
  process.exit(1)
})
