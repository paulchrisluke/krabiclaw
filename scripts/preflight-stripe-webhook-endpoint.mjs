#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import Stripe from 'stripe'
import {
  STRIPE_REQUEST_TIMEOUT_MS,
  STRIPE_WEBHOOK_EVENTS,
  StripeWebhookPreflightError,
  assertCanonicalStripeWebhookEndpointUrl,
  normalizeStripeWebhookExpectedMode,
  runStripeWebhookEndpointPreflight,
} from './lib/stripe-webhook-preflight.mjs'

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`missing_${name.toLowerCase()}`)
  return value
}

function failureEvidence(expectedUrl, error, sourceSha, expectedMode) {
  const details = error instanceof StripeWebhookPreflightError ? error.evidence : {}
  let normalizedExpectedMode = null
  try {
    normalizedExpectedMode = normalizeStripeWebhookExpectedMode(expectedMode)
  } catch {
    // Keep malformed mode input out of the evidence while preserving the failure code.
  }
  let normalizedExpectedUrl = null
  try {
    normalizedExpectedUrl = assertCanonicalStripeWebhookEndpointUrl(expectedUrl)
  } catch {
    // Keep malformed input out of the evidence while preserving the failure code.
  }
  return {
    schemaVersion: 1,
    kind: 'stripe-webhook-endpoint-preflight',
    status: 'failed',
    accountMode: normalizedExpectedMode,
    testMode: normalizedExpectedMode === 'test',
    sourceSha: sourceSha || null,
    expectedUrl: details.expectedUrl ?? normalizedExpectedUrl,
    endpointId: details.endpointId ?? null,
    endpointStatus: details.endpointStatus ?? null,
    apiVersion: details.apiVersion ?? null,
    apiVersionSource: details.apiVersionSource ?? null,
    effectiveApiVersion: details.effectiveApiVersion ?? null,
    accountDefaultApiVersions: details.accountDefaultApiVersions ?? [],
    accountDefaultApiVersionsTruncated: details.accountDefaultApiVersionsTruncated ?? false,
    accountDefaultResponseCount: details.accountDefaultResponseCount ?? 0,
    accountDefaultMissingResponseCount: details.accountDefaultMissingResponseCount ?? 0,
    accountDefaultHttpStatus: details.accountDefaultHttpStatus ?? null,
    pageCount: details.pageCount ?? null,
    maxPages: details.maxPages ?? null,
    cursorEndpointId: details.cursorEndpointId ?? null,
    expectedApiVersion: details.expectedApiVersion ?? null,
    enabledEvents: details.enabledEvents ?? [],
    expectedEvents: [...STRIPE_WEBHOOK_EVENTS].sort(),
    missingEvents: details.missingEvents ?? [],
    extraEvents: details.extraEvents ?? [],
    matchedEndpointCount: details.matchedEndpointCount ?? 0,
    enabledEndpointCount: details.enabledEndpointCount ?? 0,
    errorCode: error instanceof StripeWebhookPreflightError ? error.code : 'preflight_failed',
    capturedAt: new Date().toISOString(),
  }
}

async function writeEvidence(path, evidence) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
}

async function main() {
  const evidencePath = requiredEnv('STRIPE_WEBHOOK_PREFLIGHT_EVIDENCE_PATH')
  const expectedUrl = requiredEnv('STRIPE_WEBHOOK_ENDPOINT_URL')
  const expectedMode = process.env.STRIPE_WEBHOOK_EXPECTED_MODE?.trim() || 'test'
  const sourceSha = process.env.GITHUB_SHA?.trim() || null
  let evidence

  try {
    const result = await runStripeWebhookEndpointPreflight({
      secretKey: process.env.STRIPE_SECRET_KEY,
      expectedUrl,
      expectedMode,
      stripeFactory: (secretKey, options) => new Stripe(secretKey, {
        ...options,
        timeout: STRIPE_REQUEST_TIMEOUT_MS,
      }),
    })
    evidence = {
      schemaVersion: 1,
      kind: 'stripe-webhook-endpoint-preflight',
      ...result,
      sourceSha,
      expectedEvents: [...STRIPE_WEBHOOK_EVENTS].sort(),
      capturedAt: new Date().toISOString(),
    }
    await writeEvidence(evidencePath, evidence)
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
  } catch (error) {
    evidence = failureEvidence(expectedUrl, error, sourceSha, expectedMode)
    await writeEvidence(evidencePath, evidence)
    console.error(`Stripe webhook endpoint preflight failed: ${evidence.errorCode}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`Stripe webhook endpoint preflight failed: ${error instanceof Error ? error.message : 'preflight_failed'}`)
  process.exitCode = 1
})
