import assert from 'node:assert/strict'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { generateSQLiteDrizzleJson,generateSQLiteMigration } from 'drizzle-kit/api'
import * as schema from '../../server/db/schema.ts'
import { writeMemberScheduling, readMemberScheduling, requireSchedulingAccess, refreshMemberBusy, workingWindows } from '../../server/domain/member-scheduling.ts'
import { claimSessionCapacity, CapacityUnavailableError } from '../../server/utils/availability.ts'
import { reassignBookingProvider } from '../../server/domain/provider-reassignment.ts'
import { roleSatisfies } from '../../server/utils/mcp-auth.ts'
import type { CloudflareEnv } from '../../server/utils/auth.ts'

test('member self-service uses Better Auth permissions, public approval is admin-only, and selected disconnected busy data fails closed for only that member', {timeout:120000},async()=>{
 const runtime=new Miniflare({workers:[{config:{name:'member-scheduling-proof',type:'worker',compatibilityDate:'2024-11-01',manifest:{mainModule:'index.mjs',modules:{'index.mjs':{type:'esm',contents:'export default {fetch(){return new Response("ok")}}'}}},env:{DB:{type:'d1'}}}}]})
 const db=await runtime.getD1Database('DB')
 try {
  await db.batch((await generateSQLiteMigration(await generateSQLiteDrizzleJson({}),await generateSQLiteDrizzleJson(schema))).map(sql=>db.prepare(sql)))
  await db.prepare(`INSERT INTO organization(id,name,slug,subdomain,settings_json,integrations_json,theme_id,default_currency,status,onboarding_status,url_structure,vertical,updated_at) VALUES('org','Org','org','org','{"config":{"default_timezone":"UTC"}}','{}','theme','USD','active','complete','flat','experience','2026-10-01T00:00:00.000Z')`).run()
  for(const id of ['owner','one','two','outsider'])await db.prepare('INSERT INTO user(id,name,email,emailVerified)VALUES(?,?,?,1)').bind(id,id,`${id}@example.test`).run()
  for(const [id,role]of [['owner','owner'],['one','member'],['two','member']])await db.prepare("INSERT INTO member(id,organizationId,userId,role)VALUES(?,'org',?,?)").bind(`member-${id}`,id,role).run()
  const env={DB:db,STRIPE_SECRET_KEY:'sk_test_local_d1_no_stripe_requests',BETTER_AUTH_URL:'https://proof.example',BETTER_AUTH_SECRET:'local-proof-secret-long-enough-for-auth',NUXT_PUBLIC_PLATFORM_DOMAIN:'https://krabiclaw.test'} as CloudflareEnv
  const own={env,userId:'one',organizationId:'org'},owner={...own,userId:'owner'},hours={timezone:'America/New_York',weekly:Array.from({length:7},(_,weekday)=>({weekday,start:'09:00',end:'17:00'})),time_off:[],expected_updated_at:null}
  assert.equal(await roleSatisfies('org','member','member'),true)
  assert.equal(await roleSatisfies('org','member','admin'),false)
  await assert.rejects(()=>requireSchedulingAccess({...own,userId:'outsider'},'member-one'))
  await assert.rejects(()=>writeMemberScheduling(own,'member-two',hours))
  await assert.rejects(()=>writeMemberScheduling(own,'member-one',{...hours,public_approved:true}))
  const saved=await writeMemberScheduling(own,'member-one',{...hours,public_name:'Approved name',public_bio:'Public bio'})
  assert.equal(saved?.timezone,'America/New_York')
  assert.equal(saved?.public_approved,0)
  const approved=await writeMemberScheduling(owner,'member-one',{...hours,expected_updated_at:saved!.updated_at,public_approved:true})
  assert.equal((await readMemberScheduling(db,'org','member-one'))?.public_approved,1)
  await assert.rejects(()=>writeMemberScheduling(own,'member-one',{...hours,expected_updated_at:saved!.updated_at}),/changed/)
  const changed=await writeMemberScheduling(own,'member-one',{...hours,expected_updated_at:approved!.updated_at,public_name:'Changed public name'})
  assert.equal(changed?.public_approved,0,'self-edited content loses prior approval')
  await writeMemberScheduling({...own,userId:'two'},'member-two',{...hours,timezone:'UTC'})
  const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10),start=`${day}T14:00:00.000Z`,end=`${day}T15:00:00.000Z`
  for(const [id,member]of [['one','member-one'],['two','member-two']]) {
   await db.prepare("INSERT INTO products(id,organization_id,name,slug,created_by,updated_by)VALUES(?,'org',?,?,'owner','owner')").bind(id,id,id).run()
   await db.prepare("INSERT INTO product_variants(id,organization_id,product_id,name,created_by,updated_by)VALUES(?,'org',?,'Standard','owner','owner')").bind(`variant-${id}`,id).run()
   await db.prepare("INSERT INTO product_booking_configs(product_id,organization_id,scheduling_mode,assigned_member_id,duration_minutes,default_capacity,created_by,updated_by)VALUES(?,'org','provider',?,60,1,'owner','owner')").bind(id,member).run()
   await db.prepare("INSERT INTO product_sessions(id,organization_id,product_id,timezone,starts_at,ends_at,capacity,created_by,updated_by)VALUES(?,'org',?,'UTC',?,?,1,'owner','owner')").bind(`session-${id}`,id,start,end).run()
  }
  await db.prepare("UPDATE member_scheduling SET calendar_account_id='missing-account',calendar_ids_json='[\"busy-calendar\"]',busy_checked_at=?,busy_from=?,busy_until=?,busy_error=NULL WHERE member_id='member-one'").bind(new Date().toISOString(),new Date().toISOString(),`${day}T20:00:00.000Z`).run()
  const failed=await refreshMemberBusy(db,env,'member-one',true)
  assert(failed?.error)
  assert((await readMemberScheduling(db,'org','member-one'))?.busy_error)
  await assert.rejects(()=>claimSessionCapacity(db,{organizationId:'org',productId:'one',sessionId:'session-one',productVariantId:'variant-one',partySize:1}),CapacityUnavailableError)
  const healthy=await claimSessionCapacity(db,{organizationId:'org',productId:'two',sessionId:'session-two',productVariantId:'variant-two',partySize:1})
  assert.equal(await db.prepare('SELECT assigned_member_id FROM bookings WHERE id=?').bind(healthy.bookingId).first('assigned_member_id'),'member-two')
  await db.prepare("UPDATE member_scheduling SET calendar_account_id=NULL WHERE member_id='member-one'").run()
  assert((await claimSessionCapacity(db,{organizationId:'org',productId:'one',sessionId:'session-one',productVariantId:'variant-one',partySize:1})).bookingId)
  const following=new Date(Date.parse(start)+86400000).toISOString(),followingEnd=new Date(Date.parse(end)+86400000).toISOString()
  await db.prepare("INSERT INTO product_sessions(id,organization_id,product_id,timezone,starts_at,ends_at,capacity,created_by,updated_by)VALUES('group','org','two','UTC',?,?,3,'owner','owner')").bind(following,followingEnd).run()
  const group=await Promise.all([1,2].map(()=>claimSessionCapacity(db,{organizationId:'org',productId:'two',sessionId:'group',productVariantId:'variant-two',partySize:1})))
  await db.prepare("UPDATE product_booking_configs SET assigned_member_id='member-one' WHERE product_id='two'").run()
  const revision=await db.prepare('SELECT updated_at FROM bookings WHERE id=?').bind(group[0].bookingId).first<string>('updated_at')
  await assert.rejects(()=>reassignBookingProvider(own,{booking_id:group[0].bookingId,member_id:'member-one',expected_updated_at:revision!,idempotency_key:'self-reassignment'}))
  const move={booking_id:group[0].bookingId,member_id:'member-one',expected_updated_at:revision!,idempotency_key:'group-reassignment'}
  await reassignBookingProvider(owner,move)
  await reassignBookingProvider(owner,move)
  const members=await db.prepare("SELECT id,assigned_member_id FROM bookings WHERE product_session_id='group' ORDER BY id").all<{id:string;assigned_member_id:string}>()
  assert.deepEqual(members.results.map(row=>row.id).sort(),group.map(row=>row.bookingId).sort(),'whole Session reassignment preserves every Booking ID')
  assert(members.results.every(row=>row.assigned_member_id==='member-one'))
  const audit=await db.prepare("SELECT payload_json FROM activity_entries WHERE dedupe_key='provider:org:group-reassignment'").first<string>('payload_json')
  assert.equal(JSON.parse(audit!).old_member_id,'member-two')
  assert.equal(JSON.parse(audit!).new_member_id,'member-one')
  assert.equal(JSON.parse(audit!).actor_user_id,'owner')
  await db.prepare("UPDATE product_booking_configs SET assigned_member_id='member-one' WHERE product_id='two'").run()
  const occupiedRevision=await db.prepare('SELECT updated_at FROM bookings WHERE id=?').bind(healthy.bookingId).first<string>('updated_at')
  await assert.rejects(()=>reassignBookingProvider(owner,{booking_id:healthy.bookingId,member_id:'member-one',expected_updated_at:occupiedRevision!,idempotency_key:'overlap-refused'}),/Reassignment refused/)
  assert.equal(await db.prepare('SELECT assigned_member_id FROM bookings WHERE id=?').bind(healthy.bookingId).first('assigned_member_id'),'member-two')

 }finally{await runtime.dispose()}
})

test('member working windows retain IANA timezone across DST and merge adjacent hours',()=>{
 const {intervals}=workingWindows('America/New_York',[{weekday:1,start:'09:00',end:'12:00'},{weekday:1,start:'12:00',end:'17:00'}],new Date('2026-10-26T00:00:00.000Z'))
 assert(intervals.some(i=>i.start==='2026-10-26T13:00:00.000Z'&&i.end==='2026-10-26T21:00:00.000Z'))
 assert(intervals.some(i=>i.start==='2026-11-02T14:00:00.000Z'&&i.end==='2026-11-02T22:00:00.000Z'))
 assert.throws(()=>workingWindows('America/New_York',[{weekday:0,start:'01:30',end:'03:30'}],new Date('2026-10-26T00:00:00.000Z')),/multiple|ambiguous/i)
 assert.throws(()=>workingWindows('America/New_York',[{weekday:0,start:'02:30',end:'03:30'}],new Date('2027-03-01T00:00:00.000Z')),/exist|invalid/i)
})
