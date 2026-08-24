import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const DEFAULT_CDP_URL = 'http://127.0.0.1:9222'
const CHATGPT_URL = 'https://chatgpt.com/'
const RESPONSE_TIMEOUT_MS = 120_000

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function visible(locator) {
  return await locator.count() > 0 && await locator.first().isVisible()
}

export async function connectChatGptRecordingBrowser({ artifactDir, connectorName }) {
  const cdpUrl = process.env.CHATGPT_CDP_URL || DEFAULT_CDP_URL
  const browser = await chromium.connectOverCDP(cdpUrl)
  const context = browser.contexts()[0]
  if (!context) throw new Error(`Chrome at ${cdpUrl} did not expose a browser context.`)

  fs.mkdirSync(artifactDir, { recursive: true })
  const pagesCreated = []
  let page
  let screenshotSequence = 0
  let needsConnectorMention = true

  async function screenshot(label) {
    const filename = `${String(++screenshotSequence).padStart(2, '0')}-${slug(label)}.png`
    const outputPath = path.join(artifactDir, filename)
    await page.screenshot({ path: outputPath, fullPage: true })
    return outputPath
  }

  async function composer() {
    const byLabel = page.getByRole('textbox', { name: 'Chat with ChatGPT' }).last()
    if (await byLabel.count()) return byLabel
    const fallback = page.locator('textarea, div[contenteditable="true"]').last()
    if (await fallback.count()) return fallback
    throw new Error('Could not find the ChatGPT composer.')
  }

  async function newConversation() {
    page = await context.newPage()
    pagesCreated.push(page)
    await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded' })
    if (await visible(page.getByRole('button', { name: 'Log in', exact: true }))) {
      throw new Error(`Chrome at ${cdpUrl} is not signed in to ChatGPT.`)
    }
    await composer()
    needsConnectorMention = true
    await screenshot('conversation-ready')
    return page.url()
  }

  async function waitForResponse(previousAssistantCount, initialText = '') {
    const deadline = Date.now() + RESPONSE_TIMEOUT_MS
    const assistants = page.locator('[data-message-author-role="assistant"]')
    let lastText = initialText
    let lastChange = Date.now()
    while (Date.now() < deadline) {
      const count = await assistants.count()
      const stop = page.getByRole('button', { name: /stop generating/i })
      const allow = page.getByRole('button', { name: /^Allow(?: once)?$/i }).filter({ visible: true })
      if (count > previousAssistantCount) {
        const response = await assistants.last().innerText()
        if (response !== lastText) {
          lastText = response
          lastChange = Date.now()
        } else if (response.trim() && !await visible(stop) && !await visible(allow) && Date.now() - lastChange >= 750) {
          return response
        }
      }
      await page.waitForTimeout(250)
    }
    throw new Error('ChatGPT did not complete its response before the DOM-state timeout.')
  }

  async function sendPrompt(title, prompt, { requireApproval = false } = {}) {
    const assistants = page.locator('[data-message-author-role="assistant"]')
    const previousAssistantCount = await assistants.count()
    const input = await composer()
    if (needsConnectorMention) {
      await input.fill(`@${connectorName}`)
      await input.getByRole('link', { name: connectorName, exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
      await input.pressSequentially(` ${prompt}`)
      needsConnectorMention = false
    } else {
      await input.fill(prompt)
    }
    await page.getByRole('button', { name: 'Send prompt', exact: true }).click()

    let approvalScreenshot = null
    let approvalText = ''
    if (requireApproval) {
      const allow = page.getByRole('button', { name: /^Allow(?: once)?$/i }).filter({ visible: true })
      await allow.waitFor({ state: 'visible', timeout: RESPONSE_TIMEOUT_MS })
      approvalScreenshot = await screenshot(`${title}-approval`)
      if (await allow.count() !== 1) throw new Error(`${title} displayed more than one active Allow control.`)
      if (await assistants.count() > previousAssistantCount) approvalText = await assistants.last().innerText()
      await allow.click()
    }

    const response = await waitForResponse(previousAssistantCount, approvalText)
    const completedScreenshot = await screenshot(`${title}-completed`)
    return { response, approvalScreenshot, completedScreenshot, conversationUrl: page.url() }
  }

  async function resumeConversation(url) {
    const currentPage = page
    const existing = pagesCreated.find(candidate => !candidate.isClosed() && candidate !== currentPage && candidate.url() === url)
    if (existing) {
      await currentPage.close()
      page = existing
      await composer()
      return
    }
    await currentPage.close()
    page = await context.newPage()
    pagesCreated.push(page)
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await composer()
  }

  async function openAndVerify(publicUrl, expectedTitle) {
    const publicPage = await context.newPage()
    pagesCreated.push(publicPage)
    await publicPage.goto(publicUrl, { waitUntil: 'domcontentloaded' })
    await publicPage.getByText(expectedTitle, { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 })
    page = publicPage
    return { publicUrl, screenshot: await screenshot('published-announcement') }
  }

  async function close() {
    await Promise.all(pagesCreated.filter(candidate => !candidate.isClosed()).map(candidate => candidate.close()))
  }

  return { cdpUrl, newConversation, sendPrompt, resumeConversation, openAndVerify, close }
}
