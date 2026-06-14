import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import process from 'node:process'
import { chromium } from '@playwright/test'

const rootDir = process.cwd()
const defaultPromptsPath = path.join(rootDir, 'scripts', 'demo-recording', 'prompts.example.json')
const promptsPath = process.env.CHATGPT_PROMPTS_FILE || defaultPromptsPath
const userDataDir = process.env.CHATGPT_USER_DATA_DIR || path.join(rootDir, '.playwright', 'chatgpt-profile')
const chatgptUrl = process.env.CHATGPT_URL || 'https://chatgpt.com/'
const browserChannel = process.env.PLAYWRIGHT_CHANNEL || undefined

function readPrompts(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const data = JSON.parse(raw)
  if (!Array.isArray(data)) {
    throw new Error(`Expected an array of prompt steps in ${filePath}`)
  }
  return data
}

async function waitForEnter(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    await rl.question(`${message}\nPress Enter to continue... `)
  } finally {
    rl.close()
  }
}

async function findComposer(page) {
  const candidates = [
    'textarea',
    'div[contenteditable="true"][data-lexical-editor="true"]',
    'div[contenteditable="true"]',
  ]

  for (const selector of candidates) {
    const locator = page.locator(selector).last()
    if (await locator.count()) return locator
  }

  throw new Error('Could not find the ChatGPT message composer.')
}

async function sendPrompt(page, promptText) {
  const composer = await findComposer(page)
  await composer.click()

  const tagName = await composer.evaluate((el) => el.tagName.toLowerCase())
  if (tagName === 'textarea') {
    await composer.fill(promptText)
  } else {
    await composer.fill('')
    await composer.type(promptText, { delay: 12 })
  }

  const sendButton = page.locator(
    [
      'button[data-testid="send-button"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
    ].join(', ')
  ).first()

  if (await sendButton.count()) {
    await sendButton.click()
    return
  }

  await page.keyboard.press('Enter')
}

async function main() {
  const prompts = readPrompts(promptsPath)
  fs.mkdirSync(userDataDir, { recursive: true })

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: browserChannel,
    headless: false,
    viewport: { width: 1440, height: 1080 },
  })

  try {
    const page = context.pages()[0] || await context.newPage()
    await page.goto(chatgptUrl, { waitUntil: 'domcontentloaded' })

    console.log(`Opened ${chatgptUrl}`)
    console.log(`Using prompts from ${promptsPath}`)
    console.log(`Using browser profile at ${userDataDir}`)
    console.log()
    console.log('Manual prep before recording:')
    console.log('1. Make sure you are signed into ChatGPT in this browser profile.')
    console.log('2. Enable your KrabiClaw connector in Developer Mode.')
    console.log('3. Start ffmpeg recording in a separate terminal.')
    console.log('4. Return here and continue when the chat is ready.')
    console.log()

    await waitForEnter('Finish the manual prep steps in the browser window.')

    for (const [index, step] of prompts.entries()) {
      const title = step.title || `Step ${index + 1}`
      const prompt = step.prompt
      const postWaitMs = Number(step.postWaitMs) || 12000

      if (typeof prompt !== 'string' || !prompt.trim()) {
        throw new Error(`Prompt step ${index + 1} is missing a prompt string`)
      }

      console.log(`Running: ${title}`)
      await sendPrompt(page, prompt)
      await page.waitForTimeout(postWaitMs)

      if (step.manualPause) {
        await waitForEnter(`Review the result for "${title}".`)
      }
    }

    console.log()
    console.log('Prompt sequence complete.')
    console.log('Stop ffmpeg when you are done, or keep recording for extra narration.')
    await waitForEnter('Press Enter when you want to close the browser.')
  } finally {
    await context.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
