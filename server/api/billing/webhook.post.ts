// Handle Stripe webhooks for subscription management
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { verifyStripeWebhook, setOrganizationEntitlementsFromPlan } from '../../utils/billing'
import Stripe from 'stripe'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  // Check Stripe configuration
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return jsonResponse({ 
      error: 'Stripe webhook secret not configured' 
    }, { status: 503 })
  }

  try {
    // Get raw body and signature
    const body = await readRawBody(event)
    const signature = getHeader(event, 'stripe-signature') || ''
    
    if (!body || !signature) {
      return jsonResponse({ 
        error: 'Invalid webhook request' 
      }, { status: 400 })
    }

    // Verify webhook signature
    if (!verifyStripeWebhook(env, body.toString(), signature)) {
      return jsonResponse({ 
        error: 'Invalid webhook signature' 
      }, { status: 401 })
    }

    // Parse webhook event
    const stripe = new Stripe(env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-06-20'
    } as any)
    
    const webhookEvent = stripe.webhooks.constructEvent(
      body.toString(),
      signature,
      env.STRIPE_WEBHOOK_SECRET
    )

    // Check for idempotency - prevent duplicate webhook processing
    const existingEvent = await db.prepare(`
      SELECT id FROM stripe_webhook_events 
      WHERE stripe_event_id = ?
      LIMIT 1
    `).bind(webhookEvent.id).first()
    
    if (existingEvent) {
      console.log(`Webhook event already processed: ${webhookEvent.id}`)
      return jsonResponse({ received: true, duplicate: true })
    }

    // Record this webhook event for idempotency
    await db.prepare(`
      INSERT INTO stripe_webhook_events (id, stripe_event_id, event_type)
      VALUES (?, ?, ?)
    `).bind(
      `webhook-${webhookEvent.id}`,
      webhookEvent.id,
      webhookEvent.type
    ).run()

    // Handle different event types
    switch (webhookEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(db, webhookEvent.data.object as Stripe.Checkout.Session)
        break
        
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(db, webhookEvent.data.object as Stripe.Subscription)
        break
        
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(db, webhookEvent.data.object as Stripe.Subscription)
        break
        
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(db, webhookEvent.data.object as Stripe.Invoice)
        break
        
      case 'invoice.payment_failed':
        await handlePaymentFailed(db, webhookEvent.data.object as Stripe.Invoice)
        break
        
      default:
        console.log(`Unhandled webhook event type: ${webhookEvent.type}`)
    }

    return jsonResponse({ received: true })
    
  } catch (error) {
    console.error('Webhook processing failed:', error)
    return jsonResponse({ 
      error: 'Webhook processing failed' 
    }, { status: 500 })
  }
})

// Handle checkout session completion
async function handleCheckoutCompleted(db: any, session: Stripe.Checkout.Session) {
  const organizationId = session.metadata?.organization_id
  const plan = session.metadata?.plan
  const customerId = session.customer as string
  const subscriptionId = session.subscription as string

  if (!organizationId || !plan) {
    console.error('Missing metadata in checkout session:', session.id)
    return
  }

  try {
    // Fetch subscription to get the item ID (needed for per-location quantity updates)
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' } as any)
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const subscriptionItemId = subscription.items.data[0]?.id ?? null
    const periodEnd = (subscription as any).current_period_end
      ? new Date((subscription as any).current_period_end * 1000).toISOString()
      : null

    await db.prepare(`
      INSERT OR REPLACE INTO organization_billing
      (id, organization_id, stripe_customer_id, stripe_subscription_id, stripe_subscription_item_id,
       plan, status, current_period_end, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `billing-${organizationId}`,
      organizationId,
      customerId,
      subscriptionId,
      subscriptionItemId,
      plan,
      'active',
      periodEnd,
      new Date().toISOString()
    ).run()

    await setOrganizationEntitlementsFromPlan(process.env as any, db, organizationId, plan)

    console.log(`Checkout completed for organization ${organizationId}, plan ${plan}, item ${subscriptionItemId}`)
  } catch (error) {
    console.error('Failed to handle checkout completion:', error)
  }
}

// Handle subscription updates
async function handleSubscriptionUpdated(db: any, subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string
  
  // Find organization by customer ID
  const billing = await db.prepare(`
    SELECT organization_id FROM organization_billing WHERE stripe_customer_id = ?
  `).bind(customerId).first()
  
  if (!billing) {
    console.error('Organization billing not found for customer:', customerId)
    return
  }

  const status = subscription.status
  const currentPeriodEnd = new Date((subscription as any).current_period_end * 1000).toISOString()
  const cancelAtPeriodEnd = (subscription as any).cancel_at_period_end || false
  
  try {
    // Update organization_billing subscription status
    await db.prepare(`
      UPDATE organization_billing 
      SET stripe_subscription_id = ?, status = ?, 
          current_period_end = ?, cancel_at_period_end = ?, updated_at = ?
      WHERE organization_id = ?
    `).bind(
      subscription.id,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      new Date().toISOString(),
      billing.organization_id
    ).run()

    // Update plan based on subscription items
    const plan = getPlanFromSubscription(subscription)
    if (plan) {
      await setOrganizationEntitlementsFromPlan(process.env as any, db, billing.organization_id, plan)
    }
    
    console.log(`Subscription updated for organization ${billing.organization_id}, status ${status}`)
  } catch (error) {
    console.error('Failed to handle subscription update:', error)
  }
}

// Handle subscription deletion/cancellation
async function handleSubscriptionDeleted(db: any, subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string
  
  // Find organization by customer ID
  const billing = await db.prepare(`
    SELECT organization_id FROM organization_billing WHERE stripe_customer_id = ?
  `).bind(customerId).first()
  
  if (!billing) {
    console.error('Organization billing not found for customer:', customerId)
    return
  }

  try {
    // Update organization_billing to free plan
    await db.prepare(`
      UPDATE organization_billing 
      SET stripe_subscription_id = NULL, status = 'canceled', 
          current_period_end = NULL, cancel_at_period_end = false, updated_at = ?
      WHERE organization_id = ?
    `).bind(new Date().toISOString(), billing.organization_id).run()

    // Set free entitlements
    await setOrganizationEntitlementsFromPlan(process.env as any, db, billing.organization_id, 'free')
    
    console.log(`Subscription deleted for organization ${billing.organization_id}`)
  } catch (error) {
    console.error('Failed to handle subscription deletion:', error)
  }
}

// Handle successful payment
async function handlePaymentSucceeded(db: any, invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string
  
  // Find organization by customer ID
  const billing = await db.prepare(`
    SELECT organization_id FROM organization_billing WHERE stripe_customer_id = ?
  `).bind(customerId).first()
  
  if (!billing) {
    console.error('Organization billing not found for customer:', customerId)
    return
  }

  console.log(`Payment succeeded for organization ${billing.organization_id}`)
}

// Handle failed payment
async function handlePaymentFailed(db: any, invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string
  
  // Find organization by customer ID
  const billing = await db.prepare(`
    SELECT organization_id FROM organization_billing WHERE stripe_customer_id = ?
  `).bind(customerId).first()
  
  if (!billing) {
    console.error('Organization billing not found for customer:', customerId)
    return
  }

  console.log(`Payment failed for organization ${billing.organization_id}`)
}

// Extract plan from subscription items
function getPlanFromSubscription(subscription: Stripe.Subscription): string | null {
  const priceId = subscription.items.data[0]?.price.id
  
  if (!priceId) return null
  
  const env = process.env
  if (priceId === env.STRIPE_PRICE_PRO_MONTHLY || priceId === env.STRIPE_PRICE_PRO_ANNUAL) return 'pro'
  if (priceId === env.STRIPE_PRICE_AGENCY_MONTHLY || priceId === env.STRIPE_PRICE_AGENCY_ANNUAL) return 'agency'
  
  return null
}
