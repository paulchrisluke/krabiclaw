import { chromium } from 'playwright';

const BASE = 'https://krabiclaw.com';
const DURATION_MS = 5 * 60 * 1000;
const start = Date.now();

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

page.on('response', async (res) => {
  const status = res.status();
  if (status >= 400) {
    let body = '';
    try { body = (await res.text()).slice(0, 2000); } catch { /* response body unavailable */ }
    console.log(`\n=== ${new Date().toISOString()} ${status} ${res.url()} ===`);
    console.log(body);
  }
});
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log(`[console.error] ${msg.text()}`);
});

const paths = ['/', '/login', '/dashboard', '/pricing', '/dashboard/kikuzuki'];

let i = 0;
while (Date.now() - start < DURATION_MS) {
  const path = paths[i % paths.length];
  i++;
  try {
    const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log(`${new Date().toISOString()} ${path} -> ${res ? res.status() : 'no-response'}`);
  } catch (e) {
    console.log(`${new Date().toISOString()} ${path} -> ERROR: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 3000));
}

await browser.close();
