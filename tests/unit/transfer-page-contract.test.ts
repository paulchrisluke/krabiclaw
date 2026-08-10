import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

type TransferPageContract = {
  isTransferInfoResponse: (_value: unknown) => boolean
  isAcceptTransferResponse: (_value: unknown) => boolean
  buildTransferPreviewUrl: (
    _siteId: string | null | undefined,
    _publicConfig: { freeSiteDomain?: unknown; platformDomain?: unknown },
  ) => string
}

function readPage() {
  const source = readFileSync('pages/transfer/[token].vue', 'utf8')
  const parsed = parse(source, { filename: 'pages/transfer/[token].vue' })
  assert.equal(parsed.errors.length, 0, 'transfer page must parse as a valid SFC')
  assert.ok(parsed.descriptor.script, 'transfer page must expose its contract helpers')
  assert.ok(parsed.descriptor.scriptSetup, 'transfer page must have a setup script')
  return parsed.descriptor
}

function loadContract(): TransferPageContract {
  const descriptor = readPage()
  const compiled = ts.transpileModule(descriptor.script!.content, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const moduleExports = {}
  const context = {
    exports: moduleExports,
    module: { exports: moduleExports },
    URL,
  }
  runInNewContext(compiled, context)
  return moduleExports as TransferPageContract
}

function validTransfer() {
  return {
    id: 'transfer-1',
    site_id: 'site-1',
    site_name: 'Demo Site',
    site_subdomain: 'demo',
    to_email: 'owner@example.com',
    message: null,
    invited_plan: 'growth',
    invited_coupon: null,
    invited_interval: 'month',
    pricing_month: {
      base_cents: 4900,
      discounted_cents: null,
      coupon_duration: null,
      coupon_duration_months: null,
    },
    pricing_year: null,
    invited_domain: null,
    domain_active: false,
    requires_payment: true,
    never_expires: true,
  }
}

test('transfer page validates complete GET and accept response contracts', () => {
  const contract = loadContract()
  assert.equal(contract.isTransferInfoResponse(validTransfer()), true)
  assert.equal(contract.isTransferInfoResponse({ ...validTransfer(), pricing_month: { ...validTransfer().pricing_month, base_cents: '4900' } }), false)
  assert.equal(contract.isTransferInfoResponse({ ...validTransfer(), site_subdomain: 42 }), false)
  assert.equal(contract.isTransferInfoResponse({ ...validTransfer(), invited_interval: 'weekly' }), false)
  assert.equal(contract.isTransferInfoResponse({ ...validTransfer(), requires_payment: 1 }), false)
  assert.equal(contract.isAcceptTransferResponse({ success: true, site_id: 'site-1' }), true)
  assert.equal(contract.isAcceptTransferResponse({ success: true, site_id: 'site-1', checkout_url: 'https://checkout.stripe.com/c/pay/test' }), true)
  assert.equal(contract.isAcceptTransferResponse({ success: true, site_id: 'site-1', checkout_url: '' }), false)
  assert.equal(contract.isAcceptTransferResponse({ success: true, site_id: 'site-1', checkout_url: 'javascript:alert(1)' }), false)
  assert.equal(contract.isAcceptTransferResponse({ success: true, site_id: 'site-1', checkout_url: 'https://user:secret@example.com/checkout' }), false)
  assert.equal(contract.isAcceptTransferResponse({ success: false, site_id: 'site-1' }), false)
})

test('transfer preview URL stays on the configured platform origin', () => {
  const contract = loadContract()
  assert.equal(
    contract.buildTransferPreviewUrl('site-1', { freeSiteDomain: 'https://krabiclaw.com/', platformDomain: 'https://staging.krabiclaw.com' }),
    'https://staging.krabiclaw.com/preview/site/site-1',
  )
  assert.equal(
    contract.buildTransferPreviewUrl('site/with spaces', { freeSiteDomain: '', platformDomain: 'https://preview.krabiclaw.com' }),
    'https://preview.krabiclaw.com/preview/site/site%2Fwith%20spaces',
  )
  assert.equal(
    contract.buildTransferPreviewUrl('site-1', { freeSiteDomain: 'http://localhost:3000' }),
    'http://localhost:3000/preview/site/site-1',
  )
  assert.equal(contract.buildTransferPreviewUrl('site-1', {}), '')
  assert.equal(contract.buildTransferPreviewUrl('site-1', { platformDomain: 'https://staging.krabiclaw.com/path' }), '')
  assert.equal(contract.buildTransferPreviewUrl('site-1', { platformDomain: 'javascript:alert(1)' }), '')
})

test('transfer page uses canonical validated clients and never hardcodes the production host', () => {
  const descriptor = readPage()
  const setup = descriptor.scriptSetup!.content
  assert.match(setup, /publicApiRequest<TransferInfo>/)
  assert.match(setup, /publicApiMutation<AcceptTransferResponse>/)
  assert.match(setup, /validate: isTransferInfoResponse/)
  assert.match(setup, /validate: isAcceptTransferResponse/)
  assert.doesNotMatch(setup, /\$fetch\s*\(/)
  assert.doesNotMatch(setup, /krabiclaw\.com/)
})
