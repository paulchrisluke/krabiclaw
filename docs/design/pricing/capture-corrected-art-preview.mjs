// Owner review artifact only: substitutes three external image responses; never CMS or billing data.
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
const root=fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '')
const catalog=JSON.parse(await fs.readFile(root+'/docs/design/pricing/uploaded-media.json','utf8'))
const selected=catalog.uploads.filter(a=>a.file.startsWith('benefit-'))
const observed=new Set()
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
await page.route('https://imagedelivery.net/**',async route=>{
 const asset=selected.find(a=>new URL(a.publicUrl).pathname===new URL(route.request().url()).pathname)
 if(!asset)return route.continue()
 observed.add(asset.file)
 await route.fulfill({status:200,contentType:'image/png',path:root+'/public/pricing/'+asset.file})
})
async function capture(label,width,height){
 await page.setViewportSize({width,height})
 await page.goto((process.env.PRICING_PREVIEW_URL || 'http://localhost:3115/pricing'))
 await page.locator('[data-parity-section="comparison"]').waitFor()
 for(const section of await page.locator('[data-tenant-page] > section').all())await section.scrollIntoViewIfNeeded()
 for(const image of await page.locator('.kc-pricing-benefit img,.kc-pricing-cta > img').all())await image.evaluate(img=>img.decode())
 await page.evaluate(()=>window.scrollTo(0,0))
 const clip=await page.evaluate(()=>{
  const heading=document.querySelector('[data-tenant-page] > [data-block-type="heading"]')
  const rows=document.querySelectorAll('.kc-pricing-benefit')
  const top=heading.getBoundingClientRect().top+window.scrollY
  const bottom=rows[rows.length-1].getBoundingClientRect().bottom+window.scrollY
  return {x:0,y:top,width:window.innerWidth,height:bottom-top}
 })
 await page.screenshot({path:root+'/docs/design/pricing/evidence/pricing-'+label+'-botanical-middle.png',fullPage:true,clip})
 await page.screenshot({path:root+'/docs/design/pricing/evidence/pricing-'+label+'-botanical-preview.png',fullPage:true})
}
await capture('desktop',1440,1000)
await capture('mobile',390,844)
if(observed.size!==3)throw new Error('Not all supplied replacement assets rendered')
console.log({localRenderedAssets:[...observed],canonicalPageUnchanged:true,previewOnly:true})
await browser.close()
