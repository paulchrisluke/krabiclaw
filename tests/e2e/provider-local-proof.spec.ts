import { expect, request as playwrightRequest, test } from '@playwright/test'
import { authRequestHeaders } from './helpers/auth'
import { mcpData, mcpRequest } from './helpers/mcp'

const org='payments-proof-org',slug='payments-local-proof',ownerMember='payments-proof-owner-member'
const password='Payments-Local-Proof-2026!Aa'
test('provider CMS and MCP share member permissions, public approval, assignment and audited group reassignment',async({page,request,baseURL})=>{
 test.skip(process.env.PROVIDER_SUPPORT_PROOF!=='true'||!['localhost','127.0.0.1'].includes(new URL(baseURL!).hostname),'Documented synthetic local fixture only; no production access')
 test.setTimeout(180_000)
 const authHeaders=authRequestHeaders(baseURL!),headers={'x-preview-tenant':slug},editor=`/api/editor/organizations/${org}`
 const signin=await page.request.post('/api/auth/sign-in/email',{headers:authHeaders,data:{email:'payments-proof-owner@playwright.example',password}})
 expect(signin.status(),await signin.text()).toBe(200)
 const ownPath=`/api/organizations/${org}/members/${ownerMember}/scheduling`
 const ownBefore=(await(await page.request.get(ownPath)).json()).scheduling
 const hours={timezone:'UTC',weekly:Array.from({length:7},(_,weekday)=>({weekday,start:'09:00',end:'17:00'})),time_off:[],expected_updated_at:ownBefore?.updated_at??null,public_name:'Approved local guide',public_bio:'Public biography approved by the organization.',public_approved:true}
 const saved=await page.request.put(ownPath,{data:hours})
 expect(saved.status(),await saved.text()).toBe(200)
 const read=await mcpRequest(page.request,baseURL!,{method:'tools/call',toolName:'get_member_scheduling',args:{organization_id:org,member_id:ownerMember}})
 const canonical=mcpData<{scheduling:{updated_at:string;public_name:string;timezone:string}}>(await read.json()).scheduling
 expect(canonical).toMatchObject({public_name:hours.public_name,timezone:'UTC'})
 const mcpSave=await mcpRequest(page.request,baseURL!,{method:'tools/call',toolName:'set_member_scheduling',args:{organization_id:org,member_id:ownerMember,...hours,expected_updated_at:canonical.updated_at,public_bio:'Updated through the same canonical MCP writer.'}})
 expect((await mcpSave.json()).result.isError).not.toBe(true)
 expect((await(await page.request.get(ownPath)).json()).scheduling.public_bio).toBe('Updated through the same canonical MCP writer.')
 await page.goto(`/dashboard/${slug}/settings/members/${ownerMember}`)
 await expect(page.getByLabel('Public name',{exact:true})).toHaveValue(hours.public_name)
 await expect(page.getByRole('heading',{name:'Working hours',exact:true})).toBeVisible()
 await page.getByLabel('Public bio',{exact:true}).fill('Changed in the actual CMS form.')
 await page.getByRole('button',{name:'Save profile and availability',exact:true}).click()
 await expect.poll(async()=>mcpData<{scheduling:{public_bio:string}}>(await(await mcpRequest(page.request,baseURL!,{method:'tools/call',toolName:'get_member_scheduling',args:{organization_id:org,member_id:ownerMember}})).json()).scheduling.public_bio).toBe('Changed in the actual CMS form.')
 await page.getByRole('heading',{name:'Working hours',exact:true}).scrollIntoViewIfNeeded()
 await page.screenshot({path:'artifacts/provider-team-desktop.png',fullPage:true})
 await page.setViewportSize({width:390,height:844})
 await page.getByRole('heading',{name:'Working hours',exact:true}).scrollIntoViewIfNeeded()
 await page.screenshot({path:'artifacts/provider-team-mobile.png',fullPage:true})
 await page.setViewportSize({width:1280,height:720})
 const stamp=Date.now(),day=new Date(Date.now()+86400000),date=day.toISOString().slice(0,10)
 const products:Array<{id:string;slug:string;variants:Array<{id:string}>}>=[]
 for(let i=0;i<2;i++){
  const create=await page.request.post(`${editor}/products`,{data:{name:`Provider local proof ${stamp}-${i}`,description:'An isolated local scheduling offering.',variants:[{name:'Standard',prices:[{unit_amount:0,currency:'USD'}]}]}})
  expect(create.status(),await create.text()).toBe(201)
  const product=(await create.json()).product;products.push(product)
  const config=await page.request.put(`${editor}/products/${product.id}/booking`,{data:{duration_minutes:45,default_capacity:2,confirmation_mode:'review',online_timezone:'UTC',calendar_group:'provider-proof-shared'}})
  expect(config.status(),await config.text()).toBe(200)
  const schedule=await page.request.put(`${editor}/products/${product.id}/availability`,{data:{location_id:'provider-proof-location',slots:[{weekday:day.getUTCDay(),start_time:'14:00'}]}})
  expect(schedule.status(),await schedule.text()).toBe(200)
  const placement=await page.request.put(`${editor}/products/${product.id}/locations/provider-proof-location`,{data:{active:true,published:true}})
  expect(placement.status(),await placement.text()).toBe(200)
  const publish=await page.request.put(`${editor}/products/${product.id}/publication`,{data:{published:true}})
  expect(publish.status(),await publish.text()).toBe(200)
 }
 const fallback=await request.get(`/api/public/products/${products[0].slug}/provider`,{headers})
 expect(fallback.status(),await fallback.text()).toBe(200);expect((await fallback.json()).provider).toBeNull()
 for(const product of products){const assignment=await mcpRequest(page.request,baseURL!,{method:'tools/call',toolName:'set_product_booking_config',args:{organization_id:org,product_id:product.id,scheduling_mode:'provider',assigned_member_id:ownerMember}});expect((await assignment.json()).result.isError).not.toBe(true)}
 await page.goto(`/dashboard/${slug}/products/${products[0].id}/booking`)
 await expect(page.getByRole('combobox',{name:'Who delivers this offering',exact:true})).toBeVisible()
 await page.getByRole('combobox',{name:'Who delivers this offering',exact:true}).scrollIntoViewIfNeeded()
 await page.screenshot({path:'artifacts/provider-offering-desktop.png',fullPage:true})
 await page.setExtraHTTPHeaders(headers)
 await page.goto(`/experiences/${products[0].slug}`)
 await expect(page.getByRole('heading',{name:'Who you’ll meet with',exact:true})).toBeVisible()
 await expect(page.getByText(hours.public_name,{exact:true})).toBeVisible()
 await page.screenshot({path:'artifacts/provider-public-desktop.png',fullPage:true})
 const publicProfile=await request.get(`/api/public/products/${products[0].slug}/provider`,{headers})
 expect(await publicProfile.json()).toEqual({provider:{name:hours.public_name,photo_url:null,bio:'Changed in the actual CMS form.'}})
 const sessions=await Promise.all(products.map(async product=>{const response=await request.get(`/api/public/products/${product.slug}/sessions?location_id=provider-proof-location&from=${date}&to=${date}`,{headers});expect(response.status(),await response.text()).toBe(200);return(await response.json()).sessions.find((s:{starts_at:string})=>s.starts_at.startsWith(date))}))
 expect(sessions.every(Boolean)).toBe(true)
 const book=(i:number,n:number)=>request.post(`/api/public/products/${products[i].slug}/book`,{headers,data:{session_id:sessions[i].id,variant_id:products[i].variants[0].id,party_size:1,guest_name:`Local attendee ${n}`,guest_email:`provider-${stamp}-${n}@playwright.example`}})
 const first=await book(0,1);expect(first.status(),await first.text()).toBe(201);const booking=await first.json()
 const second=await book(0,2);expect(second.status(),await second.text()).toBe(201);const attendee=await second.json()
 const competing=await book(1,3);expect(competing.status(),await competing.text()).toBe(409)
 const detailsPath=`/api/dashboard/bookings/booking/${booking.request_id}?org=${slug}`
 const details=(await(await page.request.get(detailsPath)).json()).booking
 expect(details.assignedMemberId).toBe(ownerMember)
 const ownRead=await mcpRequest(page.request,baseURL!,{method:'tools/call',toolName:'get_product_booking',args:{organization_id:org,operational_booking_id:booking.operational_booking_id}})
 expect(mcpData<{record:{assigned_member_id:string}}>(await ownRead.json()).record.assigned_member_id).toBe(ownerMember)
 await page.setExtraHTTPHeaders({})
 const invite=await page.request.post('/api/auth/organization/invite-member',{headers:authHeaders,data:{organizationId:org,email:'payments-proof-buyer@playwright.example',role:'member'}})
 expect(invite.status(),await invite.text()).toBe(200)
 const self=await playwrightRequest.newContext({baseURL})
 try{
  const signin=await self.post('/api/auth/sign-in/email',{headers:authHeaders,data:{email:'payments-proof-buyer@playwright.example',password}});expect(signin.status(),await signin.text()).toBe(200)
  const accepted=await self.post('/api/auth/organization/accept-invitation',{headers:authHeaders,data:{invitationId:(await invite.json()).id}});expect(accepted.status(),await accepted.text()).toBe(200)
  const member=(await accepted.json()).member
  const selfPath=`/api/organizations/${org}/members/${member.id}/scheduling`
  const selfSave=await self.put(selfPath,{data:{timezone:'UTC',weekly:hours.weekly,time_off:[],expected_updated_at:null}});expect(selfSave.status(),await selfSave.text()).toBe(200)
  const ownOnly=await mcpRequest(self,baseURL!,{method:'tools/call',toolName:'get_member_scheduling',args:{organization_id:org}})
  expect(mcpData<{members:Array<{id:string}>}>(await ownOnly.json()).members.map(m=>m.id)).toEqual([member.id])
  expect((await self.get(ownPath)).status()).toBe(403)
  const forbidden=await mcpRequest(self,baseURL!,{method:'tools/call',toolName:'list_product_bookings',args:{organization_id:org}});expect((await forbidden.json()).result.isError).toBe(true)
  const assign=await mcpRequest(page.request,baseURL!,{method:'tools/call',toolName:'set_product_booking_config',args:{organization_id:org,product_id:products[0].id,assigned_member_id:member.id}});expect((await assign.json()).result.isError).not.toBe(true)
  await page.goto(`/dashboard/${slug}/bookings/booking/${booking.request_id}`)
  await expect(page.getByRole('heading',{name:'Assigned person',exact:true})).toBeVisible()
  await page.getByRole('combobox',{name:'Reassign to',exact:true}).click()
  await page.getByRole('option',{name:'Payments proof buyer',exact:true}).click()
  await page.getByRole('button',{name:'Reassign Session and notify guests',exact:true}).click()
  await expect.poll(async()=>(await(await page.request.get(detailsPath)).json()).booking.assignedMemberId).toBe(member.id)
  const other=(await(await page.request.get(`/api/dashboard/bookings/booking/${attendee.request_id}?org=${slug}`)).json()).booking
  expect(other).toMatchObject({assignedMemberId:member.id,operationalBookingId:attendee.operational_booking_id})
  await page.screenshot({path:'artifacts/provider-booking-desktop.png',fullPage:true})
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/provider-booking-mobile.png',fullPage:true})
  await page.context().clearCookies();await page.context().addCookies((await self.storageState()).cookies)
  const anonymous=await playwrightRequest.newContext({baseURL})
  try{const unauthenticated=await anonymous.get(`/member-schedule/${org}`,{maxRedirects:0});expect(unauthenticated.status()).toBe(302);expect(unauthenticated.headers().location).toContain('/login?redirect=')}finally{await anonymous.dispose()}
  const selfPage=await page.goto(`/member-schedule/${org}`)
  expect(selfPage?.headers()['cache-control']).toContain('no-store')
  await expect(page.getByRole('heading',{name:'My availability',exact:true})).toBeVisible()
  await expect(page.getByRole('checkbox',{name:'Approve this public profile',exact:true})).toHaveCount(0)
  await page.getByLabel('Public name',{exact:true}).fill('Unapproved member name')
  await page.getByRole('button',{name:'Save profile and availability',exact:true}).click()
  await expect.poll(async()=>mcpData<{scheduling:{public_name:string;public_approved:number}}>(await(await mcpRequest(self,baseURL!,{method:'tools/call',toolName:'get_member_scheduling',args:{organization_id:org,member_id:member.id}})).json()).scheduling.public_name).toBe('Unapproved member name')
  await page.screenshot({path:'artifacts/provider-self-service-mobile.png',fullPage:true})
  const withheld=await request.get(`/api/public/products/${products[0].slug}/provider`,{headers})
  expect(await withheld.json()).toEqual({provider:null})
  await page.setExtraHTTPHeaders(headers);await page.goto(`/experiences/${products[0].slug}`)
  await expect(page.getByLabel('Who you’ll meet with').getByText('Payments local proof',{exact:true})).toBeVisible()
  await expect(page.getByText('Unapproved member name',{exact:true})).toHaveCount(0)
  await page.screenshot({path:'artifacts/provider-org-fallback-mobile.png',fullPage:true})

 }finally{await self.dispose()}
})
