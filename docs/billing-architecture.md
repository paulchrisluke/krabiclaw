# KrabiClaw Billing Architecture

## Overview

KrabiClaw uses a **custom Stripe integration** for billing, not the Better Auth Stripe plugin. This provides maximum flexibility for SaaS-specific requirements while maintaining security and reliability.

## Architecture Components

### Better Auth (Authentication & Authorization)
- **User authentication**: Google OAuth, session management
- **Organization management**: Multi-tenant structure
- **Membership control**: Role-based access (owner, member)

### Custom Stripe Integration (Billing & Payments)
- **Customer management**: Stripe customer creation and storage
- **Subscription handling**: Checkout sessions, billing portal
- **Webhook processing**: Event-driven subscription state sync
- **Entitlement management**: Generic feature access system

## Database Schema

### Better Auth Tables
```sql
organization           -- Core organization data
member                 -- User membership and roles
```

### Custom Billing Tables
```sql
organization_billing    -- Stripe subscription state
organization_entitlements -- Generic feature access
stripe_webhook_events  -- Webhook idempotency
```

## Security Model

### Authentication Flow
1. User authenticates via Better Auth
2. Session contains user ID and active organization
3. Billing APIs require organization membership
4. Only organization owners can manage billing

### Webhook Security
1. **Raw body verification**: Uses `readRawBody()` before any JSON parsing
2. **Signature verification**: Stripe webhook signature with server-only secret
3. **Idempotency**: Tracks processed event IDs to prevent duplicates
4. **Event validation**: Validates metadata and organization ownership

### Data Separation
- **Stripe state**: Stored in `organization_billing` table
- **Feature access**: Stored in `organization_entitlements` table
- **Better Auth tables**: Never modified by billing code

## API Endpoints

### Billing Management
- `GET /api/billing/status` - Get current plan and entitlements
- `POST /api/billing/checkout` - Create Stripe checkout session
- `POST /api/billing/portal` - Create billing portal session
- `POST /api/billing/webhook` - Process Stripe webhooks

### Access Control
- All billing APIs require authenticated users
- Organization membership verification
- Owner-only billing access control
- Stripe customer ID resolution via organization_billing table

## Entitlements System

### Generic Key-Value Model
```typescript
organization_entitlements:
- plan: free | starter | pro | business
- custom_domains: boolean
- google_business: boolean
- remove_branding: boolean
- max_sites: number
- max_locations: number
- max_menu_items: number
- advanced_seo: boolean
```

### Plan-Based Assignment
- **Free**: Basic entitlements, no Stripe customer required
- **Paid**: Enhanced entitlements, Stripe subscription required
- **Flexible**: Easy to add new features without schema changes

## Webhook Processing

### Event Types Handled
- `checkout.session.completed` - Initial subscription creation
- `customer.subscription.created` - Subscription state changes
- `customer.subscription.updated` - Plan upgrades/downgrades
- `customer.subscription.deleted` - Cancellations
- `invoice.payment_succeeded` - Successful payments
- `invoice.payment_failed` - Payment failures

### Idempotency Guarantees
- **Event tracking**: `stripe_webhook_events` table prevents duplicates
- **Idempotent updates**: `INSERT OR REPLACE` for billing state
- **Entitlement sync**: Recalculated from billing state on each event

## Configuration

### Environment Variables
```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Price IDs (configurable)
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_BUSINESS=price_...
```

### Local Development
- **Free tier works** without Stripe configuration
- **Paid features** require Stripe configuration
- **Checkout requires** Stripe secrets and price IDs

## Integration Benefits

### Custom vs Plugin
- **Full control**: Custom webhook handling and entitlement logic
- **Cloudflare compatible**: Direct Stripe API integration
- **Flexible pricing**: Easy to change plans without code updates
- **Generic entitlements**: Feature gates independent of billing logic

### Security Advantages
- **Schema separation**: Better Auth tables remain untouched
- **Raw body verification**: Proper Stripe signature validation
- **Role-based access**: Organization owners only for billing
- **Webhook safety**: Duplicate prevention and signature verification

## Schema Workflow

Billing schema changes live in the root `schema.sql` file. Keep billing tables and Better Auth table references aligned there instead of adding numbered migration files.
