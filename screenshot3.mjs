import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage();
	page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()));
	page.on('pageerror', (err) => console.log('[pageerror]', err.stack || err.message));
	const res = await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => console.log('NAV ERROR', e.message));
	console.log('status:', res ? res.status() : 'no response');
	await page.screenshot({ path: '/tmp/dev-screenshot.png', fullPage: true });
} finally {
	await browser.close();
}
