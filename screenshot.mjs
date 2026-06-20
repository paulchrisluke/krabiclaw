import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage();
	const res = await page.goto('https://krabiclaw.com/', { waitUntil: 'networkidle', timeout: 20000 }).catch(e => { console.log('NAV ERROR', e.message); return null; });
	console.log('status:', res ? res.status() : 'no response');
	await page.screenshot({ path: '/tmp/krabiclaw-screenshot.png', fullPage: true });
} finally {
	await browser.close();
}
