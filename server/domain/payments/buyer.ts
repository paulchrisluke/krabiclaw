import {HTTPError} from 'nitro'
import {executeBatch,queryAll,queryFirst,type DbClient} from '~/server/db'
import {canCancelBookingRequest,getGuestRequest,getThreadOperationalRecord,REQUEST_CURRENT_BUYER_SQL} from '~/server/domain/requests'
import {resolveLocationContact} from '~/server/utils/contact-resolution'
import {getProduct} from '~/server/utils/product-management'
import {loadOwnerPictures} from '~/server/notifications/hero'
import {getLocationReservationConfig,productPolicySummarySource,reservationPolicySummarySource,renderBookingPolicySummary} from '~/server/utils/reservations'
import {readPaymentDetails} from './index'
import {paymentDisplay,paymentRefundsDisplay,paymentOrderDisplay} from '~/shared/payment-display'
import {isAccountActivityItem,isAccountActivityDetailResponse,type AccountActivityItem,type AccountActivityDetail,type AccountActivityKind,type AccountActivityResponse} from '~/shared/account-activity'

export async function ownedBuyerRequest(db:DbClient,userId:string,requestId:string) {
 const owned=await queryFirst<{organization_id:string;kind:'booking'|'reservation'}>(db,`SELECT r.organization_id,r.kind FROM requests r WHERE r.id=? AND r.user_id=? AND ${REQUEST_CURRENT_BUYER_SQL} AND (
  (r.kind='booking' AND EXISTS(SELECT 1 FROM bookings b WHERE b.request_id=r.id)) OR
  (r.kind='reservation' AND EXISTS(SELECT 1 FROM reservations v WHERE v.request_id=r.id)))`,[requestId,userId])
 if(!owned)throw new HTTPError({statusCode:404,statusMessage:'Owned booking not found'})
 return owned
}
type ActivityRow = {
 kind: 'booking'|'reservation'; id:string; request_id:string|null; operational_id:string; organization_id:string;
 organization_name:string; organization_slug:string; title:string; status:string;
 starts_at:string; ends_at:string; timezone:string; created_at:string; location_id:string|null;
 location_title:string|null; product_id:string|null; party_size:number
}
type BuyerPaymentRow = {id:string;organization_id:string;organization_name:string|null;organization_slug:string|null;subject_type:string;subject_id:string;price_snapshot_json:string;state:string;created_at:string;order_id:string|null;hold_request_id:string|null;hold_starts_at:string|null;hold_ends_at:string|null;hold_timezone:string|null}
async function buyerActivityRows(db:DbClient,userId:string) {
 const [visits,payments]=await Promise.all([
  queryAll<ActivityRow>(db,`SELECT 'booking' kind,COALESCE(r.id,b.id) id,r.id request_id,b.id operational_id,b.organization_id,o.name organization_name,o.slug organization_slug,p.name title,b.status,s.starts_at,s.ends_at,s.timezone,b.created_at,s.location_id,l.title location_title,b.product_id,b.party_size
   FROM bookings b LEFT JOIN requests r ON r.id=b.request_id JOIN organization o ON o.id=b.organization_id JOIN product_sessions s ON s.id=b.product_session_id AND s.organization_id=b.organization_id JOIN products p ON p.id=b.product_id AND p.organization_id=b.organization_id LEFT JOIN business_locations l ON l.id=s.location_id AND l.organization_id=b.organization_id WHERE b.user_id=? AND (r.id IS NULL OR (r.organization_id=b.organization_id AND r.kind='booking' AND r.user_id=? AND ${REQUEST_CURRENT_BUYER_SQL}))
   UNION ALL SELECT 'reservation',COALESCE(r.id,v.id),r.id,v.id,v.organization_id,o.name,o.slug,l.title,v.status,v.starts_at,v.ends_at,v.timezone,v.created_at,v.location_id,l.title,NULL,v.party_size
   FROM reservations v LEFT JOIN requests r ON r.id=v.request_id JOIN organization o ON o.id=v.organization_id JOIN business_locations l ON l.id=v.location_id AND l.organization_id=v.organization_id WHERE v.user_id=? AND (r.id IS NULL OR (r.organization_id=v.organization_id AND r.kind='reservation' AND r.user_id=? AND ${REQUEST_CURRENT_BUYER_SQL}))`,[userId,userId,userId,userId]),
  queryAll<BuyerPaymentRow>(db,`SELECT p.id,p.organization_id,o.name organization_name,o.slug organization_slug,p.subject_type,p.subject_id,p.price_snapshot_json,p.state,p.created_at,po.id order_id,r.id hold_request_id,h.starts_at hold_starts_at,h.ends_at hold_ends_at,s.timezone hold_timezone FROM payments p LEFT JOIN organization o ON o.id=p.organization_id LEFT JOIN payment_orders po ON po.payment_id=p.id AND po.buyer_user_id=p.buyer_user_id AND po.organization_id=p.organization_id LEFT JOIN payment_checkout_holds h ON h.payment_id=p.id AND h.organization_id=p.organization_id AND h.buyer_user_id=p.buyer_user_id LEFT JOIN requests r ON r.id=h.request_id AND r.organization_id=p.organization_id AND r.user_id=p.buyer_user_id AND ${REQUEST_CURRENT_BUYER_SQL} LEFT JOIN product_sessions s ON s.id=h.session_id AND s.organization_id=p.organization_id WHERE p.buyer_user_id=? ORDER BY p.created_at DESC`,[userId]),
 ])
 return {visits,payments}
}
function visitActivity(row:ActivityRow):AccountActivityItem {
 return {kind:row.kind,id:row.id,requestId:row.request_id,operationalId:row.operational_id,paymentId:null,organizationId:row.organization_id,organizationName:row.organization_name,organizationSlug:row.organization_slug,title:row.title,status:row.status,startsAt:row.starts_at,endsAt:row.ends_at,timeZone:row.timezone,createdAt:row.created_at,imageUrl:null,locationTitle:row.location_title,partySize:row.party_size}
}
function paymentActivity(row:BuyerPaymentRow):AccountActivityItem {
 const snapshot:unknown=JSON.parse(row.price_snapshot_json)
 if(!snapshot||typeof snapshot!=='object'||!('title' in snapshot)||typeof snapshot.title!=='string'||!snapshot.title.trim())throw new Error('Owned payment has no immutable title')
 const kind=row.order_id?'order':'payment'
 if(kind==='order'&&row.subject_type!=='order')throw new Error('Owned order does not match its payment subject')
 // An ended/deleted session supplies no timezone. The retained hold is not an
 // operational booking; it never manufactures a calendar occurrence.
 const scheduled=kind==='payment'&&!!row.hold_timezone
 return {kind,id:row.id,requestId:kind==='payment'?row.hold_request_id:null,operationalId:null,paymentId:row.id,organizationId:row.organization_id,organizationName:row.organization_name,organizationSlug:row.organization_slug,title:snapshot.title,status:row.state,startsAt:scheduled?row.hold_starts_at:null,endsAt:scheduled?row.hold_ends_at:null,timeZone:scheduled?row.hold_timezone:null,createdAt:row.created_at,imageUrl:null,locationTitle:null,partySize:null}
}
function resolvePaymentActivity(rows:Awaited<ReturnType<typeof buyerActivityRows>>,payment:BuyerPaymentRow):AccountActivityItem {
 const visits=rows.visits.filter(row=>row.kind===payment.subject_type&&row.operational_id===payment.subject_id&&row.organization_id===payment.organization_id)
 if(visits.length>1)throw new Error('Owned payment has ambiguous visit associations')
 return visits[0]?visitActivity(visits[0]):paymentActivity(payment)
}
export async function buyerActivities(db:DbClient,userId:string):Promise<AccountActivityResponse> {
 const rows=await buyerActivityRows(db,userId)
 const activities=rows.visits.map(visitActivity)
 for(const payment of rows.payments){
  const item=resolvePaymentActivity(rows,payment)
  if(item.kind==='payment'||item.kind==='order')activities.push(item)
 }
 for(const item of activities){
  const visit=rows.visits.find(row=>row.kind===item.kind&&row.id===item.id)
  if(visit){
   const ownerType=visit.product_id?'product':'business_location',ownerId=visit.product_id??visit.location_id
   if(ownerId)item.imageUrl=(await loadOwnerPictures(db,item.organizationId,ownerType,[ownerId])).get(ownerId)?.imageUrl??null
  }
  if(!isAccountActivityItem(item))throw new Error('Owned activity has invalid required state')
 }
 activities.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id))
 return {activities}
}
export async function buyerPaymentActivityPath(db:DbClient,userId:string,paymentId:string):Promise<string> {
 const rows=await buyerActivityRows(db,userId),payment=rows.payments.find(row=>row.id===paymentId)
 if(!payment)throw new HTTPError({statusCode:404,statusMessage:'Owned activity not found'})
 const item=resolvePaymentActivity(rows,payment)
 return `/dashboard/account/activity/${item.kind}/${encodeURIComponent(item.id)}`
}
/** Conversation links share the same actual visit/payment association resolver. */
export async function buyerRequestActivityPath(db:DbClient,userId:string,requestId:string):Promise<string|null> {
 const rows=await buyerActivityRows(db,userId)
 const visits=rows.visits.filter(row=>row.request_id===requestId)
 if(visits.length>1)throw new Error('Owned conversation has ambiguous visit associations')
 if(visits[0])return `/dashboard/account/activity/${visits[0].kind}/${encodeURIComponent(visits[0].id)}`
 const payments=rows.payments.filter(row=>row.hold_request_id===requestId)
 if(payments.length>1)return '/dashboard/account/activity'
 if(!payments[0])return null
 const item=resolvePaymentActivity(rows,payments[0])
 return `/dashboard/account/activity/${item.kind}/${encodeURIComponent(item.id)}`
}
export async function buyerActivity(db:DbClient,userId:string,kind:AccountActivityKind,id:string):Promise<AccountActivityDetail> {
 const rows=await buyerActivityRows(db,userId)
 const visit=kind==='booking'||kind==='reservation'?rows.visits.find(row=>row.kind===kind&&row.id===id):null
 const direct=kind==='order'||kind==='payment'?rows.payments.find(row=>row.id===id):null
 const item=visit?visitActivity(visit):direct?resolvePaymentActivity(rows,direct):null
 if(!item||item.kind!==kind||item.id!==id)throw new HTTPError({statusCode:404,statusMessage:'Owned activity not found'})
 const associated=visit?rows.payments.filter(row=>row.organization_id===visit.organization_id&&row.subject_type===visit.kind&&row.subject_id===visit.operational_id):direct?[direct]:[]
 const payments=await Promise.all(associated.map(async row=>{
  const detail=await readPaymentDetails(db,row.organization_id,row.id)
  if(detail.payment.buyer_user_id!==userId)throw new HTTPError({statusCode:404,statusMessage:'Owned activity not found'})
  if(detail.order&&(!('buyer_user_id' in detail.order)||detail.order.buyer_user_id!==userId||!('organization_id' in detail.order)||detail.order.organization_id!==row.organization_id))throw new Error('Owned order and payment do not match')
  return {payment:paymentDisplay(detail.payment),refunds:paymentRefundsDisplay(detail.refunds),order:paymentOrderDisplay(detail.order)}
 }))
 let policy:AccountActivityDetail['policy']=null,canCancel=false,contactEmail:string|null=null,contactPhone:string|null=null
 if(visit){
  const request=visit.request_id?await getGuestRequest(db,visit.request_id,visit.organization_id,visit.kind):null
  const record=visit.request_id?await getThreadOperationalRecord(db,visit.request_id):null
  if(visit.request_id&&(!record||record.id!==visit.operational_id||record.organization_id!==visit.organization_id||record.kind!==visit.kind||record.user_id!==userId||!request||request.user_id!==userId||request.kind==='contact'))throw new Error('Owned booking and request do not match')
  const facts=record??visit
  const contact=facts.location_id?await resolveLocationContact(db,visit.organization_id,facts.location_id):await queryFirst<{contactPhone:string|null;contactEmail:string|null}>(db,'SELECT contact_phone contactPhone,contact_email contactEmail FROM organization WHERE id=?',[visit.organization_id])
  contactEmail=contact?.contactEmail??null;contactPhone=contact?.contactPhone??null
  canCancel=!!record&&!!request&&request.kind!=='contact'&&canCancelBookingRequest(record,new Date().toISOString())&&!request.payload.cancellation.used_at
  if(facts.product_id){
   const product=await getProduct(db,visit.organization_id,facts.product_id)
   policy=renderBookingPolicySummary(productPolicySummarySource(product.details))
   item.imageUrl=(await loadOwnerPictures(db,visit.organization_id,'product',[facts.product_id])).get(facts.product_id)?.imageUrl??null
  }else if(facts.location_id){
   const config=await getLocationReservationConfig(db,{organizationId:visit.organization_id,locationId:facts.location_id})
   if(config)policy=renderBookingPolicySummary(reservationPolicySummarySource(config))
   item.imageUrl=(await loadOwnerPictures(db,visit.organization_id,'business_location',[facts.location_id])).get(facts.location_id)?.imageUrl??null
  }
 }
 const result={...item,payments,policy,canCancel,contactEmail,contactPhone,threadId:item.requestId}
 if(!isAccountActivityDetailResponse({activity:result}))throw new Error('Owned activity detail has invalid required state')
 return result
}
export async function tokenHash(token:string):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('')}
/** Hidden Checkout-return proof, accepted only after native Stripe verification. */
export async function claimCheckoutReturn(db:DbClient,userId:string,token:string) {
 if(!/^[a-f0-9-]{72}$/u.test(token)) throw new HTTPError({statusCode:400,statusMessage:'Invalid Checkout return proof'})
 const hash=await tokenHash(token),now=new Date().toISOString()
 const available=`SELECT payment_id,claimed_at FROM payment_claims WHERE token_hash=? AND expires_at>? AND EXISTS(SELECT 1 FROM payments p WHERE p.id=payment_claims.payment_id AND p.captured_amount>0 AND ((claimed_at IS NOT NULL AND p.buyer_user_id=?) OR (claimed_at IS NULL AND (p.buyer_user_id IS NULL OR p.buyer_user_id=? OR EXISTS(SELECT 1 FROM user u WHERE u.id=p.buyer_user_id AND u.isAnonymous=1)))))`
 const params=[hash,now,userId,userId]
 const claim=await queryFirst<{payment_id:string;claimed_at:string|null}>(db,available,params)
 if(!claim) throw new HTTPError({statusCode:404,statusMessage:'Purchase return proof expired or already used'})
 if(claim.claimed_at)return {payment_id:claim.payment_id,claimed:true}
 const result=await executeBatch(db,[
  {query:'UPDATE payment_claims SET claimed_at=?,claimed_user_id=? WHERE token_hash=? AND expires_at>? AND claimed_at IS NULL AND EXISTS(SELECT 1 FROM payments p WHERE p.id=payment_claims.payment_id AND p.captured_amount>0 AND (p.buyer_user_id IS NULL OR p.buyer_user_id=? OR EXISTS(SELECT 1 FROM user u WHERE u.id=p.buyer_user_id AND u.isAnonymous=1)))',params:[now,userId,hash,now,userId]},
  {query:'UPDATE payments SET buyer_user_id=? WHERE id=? AND EXISTS(SELECT 1 FROM payment_claims WHERE token_hash=? AND claimed_user_id=? AND claimed_at=?)',params:[userId,claim.payment_id,hash,userId,now]},
  {query:'UPDATE payment_orders SET buyer_user_id=? WHERE payment_id=? AND EXISTS(SELECT 1 FROM payment_claims WHERE token_hash=? AND claimed_user_id=? AND claimed_at=?)',params:[userId,claim.payment_id,hash,userId,now]},
  {query:'UPDATE payment_checkout_holds SET buyer_user_id=? WHERE payment_id=? AND EXISTS(SELECT 1 FROM payment_claims WHERE token_hash=? AND claimed_user_id=? AND claimed_at=?)',params:[userId,claim.payment_id,hash,userId,now]},
  {query:"UPDATE bookings SET user_id=? WHERE id=(SELECT subject_id FROM payments WHERE id=? AND subject_type='booking') AND EXISTS(SELECT 1 FROM payment_claims WHERE token_hash=? AND claimed_user_id=? AND claimed_at=?)",params:[userId,claim.payment_id,hash,userId,now]},
  {query:"UPDATE requests SET user_id=? WHERE id=(SELECT b.request_id FROM bookings b JOIN payments p ON p.subject_id=b.id WHERE p.id=? AND p.subject_type='booking') AND EXISTS(SELECT 1 FROM payment_claims WHERE token_hash=? AND claimed_user_id=? AND claimed_at=?)",params:[userId,claim.payment_id,hash,userId,now]},
  {query:'UPDATE payment_claims SET claimed_at=?,claimed_user_id=? WHERE payment_id=? AND token_hash<>? AND claimed_at IS NULL AND EXISTS(SELECT 1 FROM payment_claims WHERE token_hash=? AND claimed_user_id=? AND claimed_at=?)',params:[now,userId,claim.payment_id,hash,hash,userId,now]},
 ],{operation:'Attach verified Checkout purchase'})
 if(result[0]?.meta.changes!==1){
  const replay=await queryFirst<{payment_id:string;claimed_at:string|null}>(db,available,params)
  if(!replay?.claimed_at)throw new HTTPError({statusCode:404,statusMessage:'Purchase return proof expired or already used'})
 }
 return {payment_id:claim.payment_id,claimed:true}
}
