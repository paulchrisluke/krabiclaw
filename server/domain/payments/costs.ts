import type Stripe from 'stripe'
import {execute,executeBatch,queryAll,queryFirst,type DbClient} from '~/server/db'
import {currencyFractionDigits,isCurrencyCode} from '~/shared/currencies'

/** Exact provider decimal conversion; never binary floating point or FX. */
export function stripeFeeMinor(value:string,currency:string):number {
 if(!isCurrencyCode(currency)) throw new Error(`Unsupported report currency ${currency}`)
 const digits=currencyFractionDigits(currency)
 const match=/^(-?)(\d+)(?:\.(\d+))?$/u.exec(value)
 if(!match) throw new Error('Stripe fee amount must be an exact decimal')
 const fraction=match[3]??''
 if(fraction.slice(digits).replace(/0/gu,'')) throw new Error('Stripe fee precision exceeds currency minor units')
 const integer=BigInt(match[2]!)*10n**BigInt(digits)+BigInt(fraction.slice(0,digits).padEnd(digits,'0')||'0')
 const result=Number(match[1]? -integer:integer)
 if(!Number.isSafeInteger(result)) throw new Error('Stripe cost exceeds safe minor units')
 return result
}
/** RFC 4180 parser with a bounded provider report, including embedded commas/newlines. */
export function feeReportRows(csv:string):Record<string,string>[] {
 if(csv.length>5_000_000) throw new Error('Stripe fee report exceeds bounded reconciliation size')
 const rows:string[][]=[],row:string[]=[];let cell='',quoted=false
 for(let i=0;i<csv.length;i++){
  const ch=csv[i]!
  if(ch==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
  else if(!quoted&&(ch===','||ch==='\n')){row.push(cell.replace(/\r$/u,''));cell='';if(ch==='\n'){rows.push([...row]);row.length=0}}
  else cell+=ch
 }
 if(quoted) throw new Error('Unclosed Stripe report CSV field')
 if(cell||row.length){row.push(cell.replace(/\r$/u,''));rows.push(row)}
 const headers=rows.shift()
 if(!headers || new Set(headers).size!==headers.length || !['fee_transaction_id','incurred_by','currency','amount','tax','incurred_at'].every(h=>headers.includes(h))) throw new Error('Stripe fee report schema mismatch')
 return rows.filter(r=>r.some(Boolean)).map(r=>{if(r.length!==headers.length)throw new Error('Stripe report row width mismatch');return Object.fromEntries(headers.map((h,i)=>[h,r[i]!]))})
}
interface Snapshot {source_id:string;organization_id:string|null;payment_id:string|null;amount:number;currency:string;revision:number}
/** Native platform report only. An unresolved attribution is durable and never charged. */
export async function ingestStripeFeeReport(db:DbClient,livemode:boolean,csv:string) {
 const grouped=new Map<string,{incurred_by:string;currency:string;amount:number;incurred_at:string}>()
 for(const row of feeReportRows(csv)){
  const currency=row.currency!.toUpperCase(),source=`stripe-fee:${Number(livemode)}:${row.fee_transaction_id}:${row.incurred_by}:${currency}`
  if(!row.fee_transaction_id) throw new Error('Stripe fee identity is missing')
  const amount=stripeFeeMinor(row.amount!,currency)+stripeFeeMinor(row.tax||'0',currency)
  const timestamp = row.incurred_at!
  const incurredAt=new Date(/[Zz]|[+-]\d{2}:?\d{2}$/u.test(timestamp) ? timestamp : timestamp.replace(' ', 'T')+'Z').toISOString()
  const previous=grouped.get(source)
  const total = amount+(previous?.amount??0)
  if(!Number.isSafeInteger(total))throw new Error('Grouped Stripe cost exceeds safe minor units')
  grouped.set(source,{incurred_by:row.incurred_by!,currency,amount:total,incurred_at:previous?.incurred_at??incurredAt})
 }
 let attributed=0,unattributed=0
 for(const [source,row] of grouped){
  const candidates=await queryAll<{id:string;organization_id:string}>(db,`SELECT p.id,p.organization_id FROM payments p WHERE p.livemode=? AND (p.stripe_charge_id=? OR p.stripe_payment_intent_id=? OR EXISTS(SELECT 1 FROM payment_refunds r WHERE r.payment_id=p.id AND r.stripe_refund_id=?) OR EXISTS(SELECT 1 FROM payment_disputes d WHERE d.payment_id=p.id AND d.stripe_dispute_id=?)) LIMIT 2`,[Number(livemode),row.incurred_by,row.incurred_by,row.incurred_by,row.incurred_by])
  const payment=candidates.length===1?candidates[0]:null
  const connected=!payment&&candidates.length===0?await queryFirst<{organization_id:string}>(db,'SELECT organization_id FROM stripe_connected_accounts WHERE stripe_account_id=? AND livemode=? UNION ALL SELECT organization_id FROM payment_servicing_tenants WHERE stripe_account_id=? AND livemode=? LIMIT 1',[row.incurred_by,Number(livemode),row.incurred_by,Number(livemode)]):null
  const tenant=payment?.organization_id??connected?.organization_id??null
  const old=await queryFirst<Snapshot>(db,'SELECT * FROM payment_cost_snapshots WHERE source_id=?',[source])
  if(old && old.currency!==row.currency) throw new Error('Stripe fee currency changed for native identity')
  const now=new Date().toISOString(),revision=(old?.revision??0)+1
  if(old?.amount===row.amount && (old.organization_id || !tenant)) continue
  // A previously unresolved snapshot has never produced usage.
  const delta=row.amount-(old?.organization_id?old.amount:0)
  await executeBatch(db,[
   {query:`INSERT INTO payment_cost_snapshots(source_id,organization_id,payment_id,incurred_by,currency,amount,incurred_at,revision,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET organization_id=excluded.organization_id,payment_id=excluded.payment_id,amount=excluded.amount,revision=excluded.revision,updated_at=excluded.updated_at WHERE payment_cost_snapshots.revision=?`,params:[source,tenant,payment?.id??null,row.incurred_by,row.currency,row.amount,row.incurred_at,revision,now,old?.revision??0]},
   ...(tenant&&delta!==0?[{query:`INSERT INTO payment_usage_events(id,organization_id,payment_id,kind,currency,amount,source_id,provider_occurred_at,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM payment_cost_snapshots WHERE source_id=? AND revision=? AND amount=?) ON CONFLICT(source_id) DO NOTHING`,params:[crypto.randomUUID(),tenant,payment?.id??null,old?.organization_id?'stripe_cost_adjustment':'stripe_cost',row.currency,delta,`${source}:revision:${revision}`,row.incurred_at,now,source,revision,row.amount]}]:[]),
  ],{operation:'Reconcile native attributable Stripe costs'})
  if(tenant)attributed++;else unattributed++
 }
 return {attributed,unattributed}
}
export async function reconcileStripeCosts(db:DbClient,stripe:Stripe,livemode:boolean,apiKey:string) {
 const now=new Date().toISOString()
 const pending=await queryAll<{id:string;stripe_report_id:string|null;interval_start:number;interval_end:number}>(db,"SELECT id,stripe_report_id,interval_start,interval_end FROM payment_fee_reports WHERE livemode=? AND status IN ('pending','creating') ORDER BY created_at LIMIT 3",[Number(livemode)])
 for(const report of pending){
  const native=report.stripe_report_id ? await stripe.reporting.reportRuns.retrieve(report.stripe_report_id) : await createFeeReport(stripe,report.id,report.interval_start,report.interval_end)
  if(!report.stripe_report_id) await execute(db,"UPDATE payment_fee_reports SET stripe_report_id=?,status='pending',updated_at=? WHERE id=?",[native.id,now,report.id])
  if(native.livemode!==livemode) throw new Error('Stripe fee report mode mismatch')
  if(native.status==='failed'){await execute(db,"UPDATE payment_fee_reports SET status='failed',error=?,updated_at=? WHERE id=?",[native.error??'Stripe report failed',now,report.id]);continue}
  if(native.status!=='succeeded' || !native.result?.url) continue
  const url=new URL(native.result.url)
  if(url.protocol!=='https:' || (url.hostname!=='files.stripe.com' && url.hostname!=='api.stripe.com')) throw new Error('Unexpected native Stripe report file origin')
  const response=await fetch(url,{headers:{Authorization:`Bearer ${apiKey}`},redirect:'error',signal:AbortSignal.timeout(10000)})
  if(!response.ok) throw new Error(`Stripe fee report download failed (${response.status})`)
  await ingestStripeFeeReport(db,livemode,await response.text())
  await execute(db,"UPDATE payment_fee_reports SET status='processed',error=NULL,updated_at=? WHERE id=?",[now,report.id])
 }
 // Reports lag at least 96 hours. Revisit the last 35 days for late fee corrections.
 const reportType=await stripe.reporting.reportTypes.retrieve('all_fees.balance_transaction_created.itemized.2')
 if(reportType.livemode!==livemode)throw new Error('Stripe report type mode mismatch')
 const end=Math.min(Math.floor(Date.now()/86400000)*86400-4*86400,reportType.data_available_end-1),start=Math.max(end-35*86400,reportType.data_available_start),id=`fees:${Number(livemode)}:${end}`
 if(start>=end)return
 const existing=await queryFirst(db,'SELECT id FROM payment_fee_reports WHERE id=?',[id])
 if(existing)return
 await execute(db,"INSERT INTO payment_fee_reports(id,livemode,interval_start,interval_end,status,created_at,updated_at) VALUES(?,?,?,?,'creating',?,?)",[id,Number(livemode),start,end,now,now])
 try{
  const report=await createFeeReport(stripe,id,start,end)
  await execute(db,"UPDATE payment_fee_reports SET stripe_report_id=?,status='pending',updated_at=? WHERE id=?",[report.id,now,id])
 }catch(error){await execute(db,"UPDATE payment_fee_reports SET error=?,updated_at=? WHERE id=?",[error instanceof Error?error.message:String(error),now,id]);throw error}
}

function createFeeReport(stripe:Stripe,id:string,start:number,end:number) {
 return stripe.reporting.reportRuns.create({report_type:'all_fees.balance_transaction_created.itemized.2',parameters:{interval_start:start,interval_end:end,timezone:'Etc/UTC',columns:['fee_transaction_id','incurred_by','currency','amount','tax','incurred_at']}},{idempotencyKey:id})
}
