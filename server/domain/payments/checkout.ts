import { sessionMemberSql } from '~/server/utils/provider-allocation'
import type Stripe from 'stripe'
import { HTTPError } from 'nitro'
import { execute, executeBatch, queryAll, queryFirst, type DbClient, type BatchQuery } from '~/server/db'
import { selectPrice, type Price } from '~/shared/prices'
import { sessionAllocationPredicate } from '~/server/utils/availability'
import { getStripeConnectedAccount, stripeLivemodeFromKey } from '~/server/utils/stripe-connect'
import { hasOrganizationEntitlement } from '~/server/utils/billing'
import type { CloudflareEnv } from '~/server/utils/auth'
import { tokenHash } from './buyer'
import { assertMinorAmount, requirePayment } from './index'

export interface CheckoutInput {
  organizationId: string
  buyerUserId: string | null
  productId: string
  variantId: string
  sessionId?: string
  requestId?: string
  requestFingerprint?: string
  quantity: number
  idempotencyKey: string
  returnOrigin: string
  following?: (paymentId: string) => BatchQuery[]
}
export async function createPaymentCheckout(db: DbClient, stripe: Stripe, env: CloudflareEnv, input: CheckoutInput, retry = false) {
  assertMinorAmount(input.quantity)
  if (input.quantity > 100 || !/^[a-zA-Z0-9_-]{8,128}$/u.test(input.idempotencyKey)) throw new HTTPError({statusCode:400,statusMessage:'Invalid checkout quantity or idempotency key'})
  if (!await hasOrganizationEntitlement(env,input.organizationId,'payments')) throw new HTTPError({statusCode:403,statusMessage:'Payments entitlement is required for new acceptance'})
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PAYMENTS_METHOD_CONFIGURATION) throw new HTTPError({statusCode:503,statusMessage:'Stripe Payments synchronous-method configuration is required'})
  if(await queryFirst(db,'SELECT stripe_account_id FROM payment_servicing_tenants WHERE organization_id=? LIMIT 1',[input.organizationId]))throw new HTTPError({statusCode:409,statusMessage:'Tenant deletion servicing prevents new payment acceptance'})
  const billing=await queryFirst<{status:string}>(db,'SELECT status FROM payment_billing_accounts WHERE organization_id=? AND metronome_contract_id IS NOT NULL',[input.organizationId])
  if(!billing||billing.status!=='active')throw new HTTPError({statusCode:409,statusMessage:'Active operating Payments usage billing is required before accepting customer funds'})
  const origin = new URL(input.returnOrigin)
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Payments return origin must be an HTTPS origin')
  const connected = await getStripeConnectedAccount(db,input.organizationId)
  if (!connected?.stripeAccountId || connected.status !== 'ready' || connected.country !== 'US' || connected.livemode !== stripeLivemodeFromKey(env.STRIPE_SECRET_KEY)) throw new HTTPError({statusCode:409,statusMessage:'Supported US Stripe account is not ready'})
  const account = await stripe.v2.core.accounts.retrieve(connected.stripeAccountId,{include:['defaults','configuration.merchant','identity']})
  if (account.dashboard !== 'express' || account.livemode !== connected.livemode || account.defaults?.responsibilities?.fees_collector !== 'application' || account.defaults.responsibilities.losses_collector !== 'stripe' || account.configuration?.merchant?.capabilities?.card_payments?.status !== 'active') throw new HTTPError({statusCode:409,statusMessage:'Stripe financial responsibilities or capability do not match Payments requirements'})
  const configurations=await stripe.paymentMethodConfigurations.list({limit:100},{stripeAccount:connected.stripeAccountId})
  if(configurations.has_more)throw new HTTPError({statusCode:409,statusMessage:'Connected checkout configuration needs bounded operator review'})
  const matching=configurations.data.filter(configuration=>configuration.parent===env.STRIPE_PAYMENTS_METHOD_CONFIGURATION||configuration.id===env.STRIPE_PAYMENTS_METHOD_CONFIGURATION)
  if(matching.length!==1)throw new HTTPError({statusCode:409,statusMessage:'A unique connected payment configuration inheriting the Payments parent is required'})
  const methods=matching[0]!
  let methodConfigurationId=methods.id
  if (!methods.active) throw new HTTPError({statusCode:409,statusMessage:'Checkout payment method configuration is inactive'})
  for (const [name, value] of Object.entries(methods)) {
    if (value && typeof value==='object' && 'available' in value && 'display_preference' in value && value.available && value.display_preference && typeof value.display_preference==='object' && 'value' in value.display_preference && value.display_preference.value==='on' && !['card','link','apple_pay','google_pay'].includes(name)) throw new HTTPError({statusCode:409,statusMessage:`Disable delayed or unsupported checkout method ${name} before accepting booked payments`})
  }
  const [taxSettings, registrations] = await Promise.all([stripe.tax.settings.retrieve({}, {stripeAccount:connected.stripeAccountId}), stripe.tax.registrations.list({status:'active',limit:1}, {stripeAccount:connected.stripeAccountId})])
  let automaticTax = taxSettings.status==='active' && registrations.data.length>0
  const key = `checkout:${input.organizationId}:${input.idempotencyKey}`
  const previous = await queryFirst<{id:string;payment_id:string;checkout_url:string|null;expires_at:string;return_token:string}>(db,'SELECT id,payment_id,checkout_url,expires_at,return_token FROM payment_attempts WHERE idempotency_key=?',[key])
  const product = await queryFirst<{name:string;tax_code:string|null;currency:string}>(db,`SELECT p.name,p.tax_code,o.default_currency AS currency FROM products p JOIN organization o ON o.id=p.organization_id JOIN product_variants v ON v.product_id=p.id AND v.organization_id=p.organization_id WHERE p.organization_id=? AND p.id=? AND v.id=? AND p.active=1 AND v.active=1`,[input.organizationId,input.productId,input.variantId])
  if (!product || product.currency !== 'USD') throw new HTTPError({statusCode:409,statusMessage:'An active USD offering is required'})
  let projectionTitle=product.name,projectionTaxCode=product.tax_code
  const session = input.sessionId ? await queryFirst<{id:string;location_id:string|null;starts_at:string;ends_at:string;calendar_group:string|null;online_payment_required:number}>(db,`SELECT s.*,c.calendar_group,c.online_payment_required FROM product_sessions s JOIN product_booking_configs c ON c.product_id=s.product_id AND c.organization_id=s.organization_id WHERE s.organization_id=? AND s.id=? AND s.product_id=?`,[input.organizationId,input.sessionId,input.productId]) : null
  if (input.sessionId && !session) throw new HTTPError({statusCode:404,statusMessage:'Session not found'})
  if (session && !session.online_payment_required) throw new HTTPError({statusCode:409,statusMessage:'This offering uses pay-later booking'})
  if(!input.sessionId&&await queryFirst(db,'SELECT product_id FROM product_booking_configs WHERE product_id=? AND organization_id=?',[input.productId,input.organizationId]))throw new HTTPError({statusCode:409,statusMessage:'A configured booking offering requires a real session, not a physical order checkout'})
  const rawPrices = await queryAll<Price>(db,'SELECT * FROM prices WHERE organization_id=? AND product_variant_id=?',[input.organizationId,input.variantId])
  const now = new Date().toISOString()
  let price = selectPrice(rawPrices.map(p=>({...p,active:Boolean(p.active)})),{currency:'USD',location_id:session?.location_id ?? null,at:now,billing:{type:'one_time'}})
  if (!price && !previous) throw new HTTPError({statusCode:409,statusMessage:'Offering has no current one-time price'})
  if (price?.unit_amount === 0 && !previous) throw new HTTPError({statusCode:409,statusMessage:'Free offerings use the canonical booking flow without checkout'})
  if (previous) {
    const frozen = await requirePayment(db,input.organizationId,previous.payment_id)
    const snapshot = JSON.parse(frozen.price_snapshot_json) as {title?:string;tax_code?:string|null;price:Price;product_id:string;variant_id:string;quantity:number;session_id:string|null;automatic_tax:boolean;method_configuration_id:string;request_fingerprint?:string}
    if (frozen.buyer_user_id !== input.buyerUserId || snapshot.product_id!==input.productId || snapshot.variant_id!==input.variantId || snapshot.quantity!==input.quantity || snapshot.session_id!==(input.sessionId??null) || snapshot.request_fingerprint!==input.requestFingerprint) throw new HTTPError({statusCode:409,statusMessage:'Checkout retry does not match its immutable purchase'})
    projectionTitle=snapshot.title??projectionTitle
    projectionTaxCode=snapshot.tax_code??projectionTaxCode
    price = snapshot.price
    automaticTax = snapshot.automatic_tax
    methodConfigurationId=snapshot.method_configuration_id
  }
  if(!price)throw new Error('Immutable checkout price is missing')
  const amount = price.unit_amount*input.quantity
  assertMinorAmount(amount)
  const id = previous?.payment_id ?? crypto.randomUUID(), attemptId = previous?.id ?? crypto.randomUUID(), holdId = crypto.randomUUID(), orderId = crypto.randomUUID()
  const returnToken=previous?.return_token ?? crypto.randomUUID()+crypto.randomUUID()
  const returnHash=await tokenHash(returnToken)
  const expiresAt = previous?.expires_at ?? new Date(Date.now()+60*60*1000).toISOString()
  if (expiresAt<=now) throw new HTTPError({statusCode:409,statusMessage:'Checkout hold expired; start a new request',data:{code:'checkout_expired'}})
  if (previous?.checkout_url) return {payment_id:previous.payment_id,checkout_url:previous.checkout_url,expires_at:expiresAt}
  if (!previous) {
    try { await executeBatch(db,[
      {query:`INSERT INTO payments(id,organization_id,buyer_user_id,stripe_account_id,livemode,subject_type,subject_id,location_id,currency,amount,price_snapshot_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,params:[id,input.organizationId,input.buyerUserId,connected.stripeAccountId,Number(connected.livemode),session?'booking':'order',session?null:orderId,session?.location_id??null,price.currency,amount,JSON.stringify({title:projectionTitle,tax_code:projectionTaxCode,price,product_id:input.productId,variant_id:input.variantId,quantity:input.quantity,session_id:input.sessionId??null,automatic_tax:automaticTax,method_configuration_id:methodConfigurationId,request_fingerprint:input.requestFingerprint}),now,now]},
      ...(session ? [{query:`INSERT INTO payment_checkout_holds(id,organization_id,product_id,variant_id,price_id,session_id,buyer_user_id,request_id,payment_id,quantity,amount,currency,calendar_group,starts_at,ends_at,status,expires_at,created_at,assigned_member_id)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,c.calendar_group,s.starts_at,s.ends_at,'active',?,?,${sessionMemberSql('s')} FROM product_sessions s JOIN product_booking_configs c ON c.product_id=s.product_id AND c.organization_id=s.organization_id WHERE s.id=? AND s.organization_id=? AND s.product_id=? AND ${sessionAllocationPredicate({organizationId:input.organizationId,productId:input.productId,sessionId:session.id,partySize:input.quantity,now}).query}`,params:[holdId,input.organizationId,input.productId,input.variantId,price.id,session.id,input.buyerUserId,input.requestId??null,id,input.quantity,amount,price.currency,expiresAt,now,session.id,input.organizationId,input.productId,...sessionAllocationPredicate({organizationId:input.organizationId,productId:input.productId,sessionId:session.id,partySize:input.quantity,now}).params!]}] : [
        {query:'INSERT INTO payment_orders(id,organization_id,buyer_user_id,payment_id,currency,amount,created_at) VALUES(?,?,?,?,?,?,?)',params:[orderId,input.organizationId,input.buyerUserId,id,price.currency,amount,now]},
        {query:'INSERT INTO payment_order_lines(id,order_id,product_id,variant_id,price_id,title,unit_amount,quantity,currency,tax_behavior) VALUES(?,?,?,?,?,?,?,?,?,?)',params:[crypto.randomUUID(),orderId,input.productId,input.variantId,price.id,product.name,price.unit_amount,input.quantity,price.currency,price.tax_behavior]},
      ]),
      ...(session ? [{query:'UPDATE product_sessions SET assigned_member_id=(SELECT assigned_member_id FROM payment_checkout_holds WHERE payment_id=?) WHERE id=? AND EXISTS(SELECT 1 FROM payment_checkout_holds WHERE payment_id=? AND status=\'active\')',params:[id,session.id,id]}]:[]),
      {query:`INSERT INTO payment_attempts(id,payment_id,idempotency_key,return_token,status,expires_at,created_at,updated_at) SELECT ?,?,?,?,'creating',?,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM payment_checkout_holds WHERE payment_id=? AND status='active')`,params:[attemptId,id,key,returnToken,expiresAt,now,now,Number(Boolean(session)),id]},
      ...(input.following?.(id) ?? []),
      {query:'INSERT INTO payment_claims(token_hash,payment_id,expires_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM payment_attempts WHERE id=?)',params:[returnHash,id,new Date(Date.now()+86400000).toISOString(),attemptId]},
    ],{operation:'Reserve payment checkout'})
    } catch(error) {
      const raced=await queryFirst(db,'SELECT id FROM payment_attempts WHERE idempotency_key=?',[key])
      if(raced && !retry) return await createPaymentCheckout(db,stripe,env,input,true)
      throw error
    }
    const attempt = await queryFirst(db,'SELECT id FROM payment_attempts WHERE id=?',[attemptId])
    if (!attempt) {
      await execute(db,"UPDATE payments SET state='failed',updated_at=? WHERE id=?",[now,id])
      throw new HTTPError({statusCode:409,statusMessage:'Session capacity is unavailable'})
    }
  }
  try {
  // Projection IDs are seller-scoped. Revisions use the frozen unit amount in their idempotency key.
  const productMapping = await queryFirst<{stripe_id:string}>(db,`SELECT stripe_id FROM stripe_catalog_mappings WHERE organization_id=? AND local_entity='product_variant' AND local_id=? AND stripe_account_id=? AND livemode=?`,[input.organizationId,input.variantId,connected.stripeAccountId,Number(connected.livemode)])
  const stripeProductId = productMapping?.stripe_id ?? (await stripe.products.create({name:projectionTitle,...(projectionTaxCode?{tax_code:projectionTaxCode}:{}),metadata:{krabiclaw_variant_id:input.variantId}}, {stripeAccount:connected.stripeAccountId,idempotencyKey:`catalog:${input.organizationId}:${input.variantId}`})).id
  const stripePrice = await stripe.prices.create({product:stripeProductId,currency:price.currency.toLowerCase(),unit_amount:price.unit_amount,tax_behavior:price.tax_behavior},{stripeAccount:connected.stripeAccountId,idempotencyKey:`catalog:${price.id}:${price.currency}:${price.unit_amount}:${price.tax_behavior}`})
  await executeBatch(db, ['product_variant','price'].map((entity,index)=>({query:`INSERT INTO stripe_catalog_mappings(id,organization_id,local_entity,local_id,stripe_account_id,livemode,stripe_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(local_entity,local_id,stripe_account_id,livemode) DO UPDATE SET stripe_id=excluded.stripe_id,updated_at=excluded.updated_at`,params:[crypto.randomUUID(),input.organizationId,entity,index?price.id:input.variantId,connected.stripeAccountId,Number(connected.livemode),index?stripePrice.id:stripeProductId,now,now]})))
  const checkout = await stripe.checkout.sessions.create({mode:'payment',automatic_tax:{enabled:automaticTax},line_items:[{price:stripePrice.id,quantity:input.quantity}],payment_method_configuration:methodConfigurationId,
    payment_intent_data:{application_fee_amount:0,metadata:{krabiclaw_payment_id:id}},metadata:{krabiclaw_payment_id:id},client_reference_id:id,
    expires_at:Math.floor(Date.parse(expiresAt)/1000),success_url:new URL(`/account?payment_id=${encodeURIComponent(id)}&purchase_claim=${encodeURIComponent(returnToken)}`,origin).toString(),cancel_url:new URL('/account?payment=cancelled',origin).toString(),
  },{stripeAccount:connected.stripeAccountId,idempotencyKey:key})
  if (!checkout.url || checkout.livemode !== connected.livemode) throw new Error('Stripe Checkout returned invalid scoped handoff')
  await execute(db,`UPDATE payment_attempts SET stripe_checkout_id=?,checkout_url=?,status='open',updated_at=? WHERE id=?`,[checkout.id,checkout.url,new Date().toISOString(),attemptId])
  return {payment_id:id,checkout_url:checkout.url,expires_at:expiresAt}
  } catch(error) {
    await execute(db,'UPDATE payment_attempts SET error=?,updated_at=? WHERE id=?',[error instanceof Error?error.message.slice(0,500):'Provider checkout failed',new Date().toISOString(),attemptId])
    throw error
  }
}
