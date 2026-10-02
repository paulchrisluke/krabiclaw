import {HTTPError} from 'nitro'
import {execute,executeBatch,queryAll,queryFirst,type DbClient} from '~/server/db'
import {canCancelBookingRequest,getGuestRequest,getThreadOperationalRecord} from '~/server/domain/requests'
import {resolveLocationContact} from '~/server/utils/contact-resolution'

export async function ownedBuyerRequest(db:DbClient,userId:string,requestId:string) {
 const owned=await queryFirst<{organization_id:string;kind:'booking'|'reservation'}>(db,`SELECT organization_id,kind FROM requests WHERE id=? AND user_id=? AND (
  (kind='booking' AND EXISTS(SELECT 1 FROM bookings b WHERE b.request_id=requests.id AND b.organization_id=requests.organization_id AND b.user_id=?)) OR
  (kind='reservation' AND EXISTS(SELECT 1 FROM reservations r WHERE r.request_id=requests.id AND r.organization_id=requests.organization_id AND r.user_id=?)))`,[requestId,userId,userId,userId])
 if(!owned)throw new HTTPError({statusCode:404,statusMessage:'Owned booking not found'})
 return owned
}
export async function buyerPayments(db:DbClient,userId:string) {
 const [payments,bookings,reservations]=await Promise.all([
  queryAll(db,`SELECT p.*,o.fulfillment_status,json_extract(p.price_snapshot_json,'$.title') AS title FROM payments p LEFT JOIN payment_orders o ON o.payment_id=p.id WHERE p.buyer_user_id=? ORDER BY p.created_at DESC LIMIT 100`,[userId]),
  queryAll<{id:string;organization_id:string;request_id:string|null;status:string;title:string;starts_at:string;ends_at:string;timezone:string}>(db,'SELECT b.id,b.organization_id,b.request_id,b.status,p.name AS title,s.starts_at,s.ends_at,s.timezone FROM bookings b JOIN product_sessions s ON s.id=b.product_session_id AND s.organization_id=b.organization_id JOIN products p ON p.id=b.product_id AND p.organization_id=b.organization_id WHERE b.user_id=? ORDER BY b.created_at DESC LIMIT 100',[userId]),
  queryAll<{id:string;organization_id:string;request_id:string|null;status:string;starts_at:string;ends_at:string;timezone:string}>(db,'SELECT id,organization_id,request_id,status,starts_at,ends_at,timezone FROM reservations WHERE user_id=? ORDER BY created_at DESC LIMIT 100',[userId]),
 ])
 const refunds=await queryAll(db,'SELECT r.*,p.currency FROM payment_refunds r JOIN payments p ON p.id=r.payment_id WHERE p.buyer_user_id=? ORDER BY r.created_at DESC LIMIT 100',[userId])
 const now=new Date().toISOString()
 async function management<T extends {id:string;organization_id:string;request_id:string|null}>(visit:T) {
  if(!visit.request_id)return {...visit,can_cancel:false,contactPhone:null,contactEmail:null}
  const scope=await ownedBuyerRequest(db,userId,visit.request_id)
  const [request,record]=await Promise.all([getGuestRequest(db,visit.request_id,scope.organization_id,scope.kind),getThreadOperationalRecord(db,visit.request_id)])
  if(!request||request.kind==='contact'||!record||record.id!==visit.id||record.organization_id!==visit.organization_id||record.kind!==scope.kind||record.user_id!==userId)throw new Error('Owned booking and request do not match')
  const contact=record.location_id?await resolveLocationContact(db,visit.organization_id,record.location_id):record.kind==='booking'?await queryFirst<{contactPhone:string|null;contactEmail:string|null}>(db,'SELECT contact_phone AS contactPhone,contact_email AS contactEmail FROM organization WHERE id=?',[visit.organization_id]):null
  return {...visit,can_cancel:canCancelBookingRequest(record,now)&&!request.payload.cancellation.used_at,contactPhone:contact?.contactPhone??null,contactEmail:contact?.contactEmail??null}
 }
 return {payments,bookings:await Promise.all(bookings.map(management)),reservations:await Promise.all(reservations.map(management)),refunds}
}
export async function tokenHash(token:string):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('')}
/** Purchase possession proof is independent of email equality and merchant memberships. */
export async function createPurchaseClaim(db:DbClient,userId:string,paymentId:string) {
 const owned=await queryFirst(db,"SELECT id FROM payments WHERE id=? AND buyer_user_id=? AND captured_amount>0",[paymentId,userId])
 if(!owned) throw new HTTPError({statusCode:404,statusMessage:'Owned captured purchase not found'})
 const token=crypto.randomUUID()+crypto.randomUUID(),expiresAt=new Date(Date.now()+86400000).toISOString()
 await execute(db,'INSERT INTO payment_claims(token_hash,payment_id,expires_at) VALUES(?,?,?)',[await tokenHash(token),paymentId,expiresAt])
 return {claim_code:token,expires_at:expiresAt}
}
export async function claimPurchase(db:DbClient,verifiedUserId:string,token:string) {
 if(!/^[a-f0-9-]{72}$/u.test(token)) throw new HTTPError({statusCode:400,statusMessage:'Invalid purchase claim code'})
 const hash=await tokenHash(token),now=new Date().toISOString()
 const claim=await queryFirst<{payment_id:string}>(db,'SELECT payment_id FROM payment_claims WHERE token_hash=? AND expires_at>? AND claimed_at IS NULL AND EXISTS(SELECT 1 FROM payments WHERE id=payment_claims.payment_id AND captured_amount>0)',[hash,now])
 if(!claim) throw new HTTPError({statusCode:404,statusMessage:'Purchase claim expired or already used'})
 const result=await executeBatch(db,[
  {query:'UPDATE payment_claims SET claimed_at=?,claimed_user_id=? WHERE token_hash=? AND expires_at>? AND claimed_at IS NULL',params:[now,verifiedUserId,hash,now]},
  {query:'UPDATE payments SET buyer_user_id=? WHERE id=? AND EXISTS(SELECT 1 FROM payment_claims WHERE token_hash=? AND claimed_user_id=? AND claimed_at=?)',params:[verifiedUserId,claim.payment_id,hash,verifiedUserId,now]},
  {query:'UPDATE payment_orders SET buyer_user_id=? WHERE payment_id=? AND EXISTS(SELECT 1 FROM payment_claims WHERE token_hash=? AND claimed_user_id=? AND claimed_at=?)',params:[verifiedUserId,claim.payment_id,hash,verifiedUserId,now]},
  {query:"UPDATE bookings SET user_id=? WHERE id=(SELECT subject_id FROM payments WHERE id=? AND subject_type='booking') AND EXISTS(SELECT 1 FROM payment_claims WHERE token_hash=? AND claimed_user_id=? AND claimed_at=?)",params:[verifiedUserId,claim.payment_id,hash,verifiedUserId,now]},
  {query:"UPDATE requests SET user_id=? WHERE id=(SELECT b.request_id FROM bookings b JOIN payments p ON p.subject_id=b.id WHERE p.id=? AND p.subject_type='booking') AND EXISTS(SELECT 1 FROM payment_claims WHERE token_hash=? AND claimed_user_id=? AND claimed_at=?)",params:[verifiedUserId,claim.payment_id,hash,verifiedUserId,now]},
  {query:'UPDATE payment_claims SET claimed_at=?,claimed_user_id=? WHERE payment_id=? AND token_hash<>? AND claimed_at IS NULL AND EXISTS(SELECT 1 FROM payment_claims WHERE token_hash=? AND claimed_user_id=? AND claimed_at=?)',params:[now,verifiedUserId,claim.payment_id,hash,hash,verifiedUserId,now]},
 ],{operation:'Verify purchase possession and claim'})
 if(result[0]?.meta.changes!==1) throw new HTTPError({statusCode:409,statusMessage:'Purchase claim was consumed concurrently'})
 return {payment_id:claim.payment_id,claimed:true}
}
