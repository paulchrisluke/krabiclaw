import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on('response', (res) => {
    const status = res.status();
    if (status >= 300) console.log(status, res.url());
  });
  page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  await page.goto('https://krabiclaw.com/', { waitUntil: 'networkidle', timeout: 20000 }).catch(e => console.log('NAV ERROR', e.message));
} finally {
  await browser.close();
}
