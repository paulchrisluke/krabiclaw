import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

const availability = z.enum(['available', 'conditional', 'unavailable', 'unsupported'])
const relativePath = z.string().min(1).refine(value => !path.isAbsolute(value) && !value.split('/').includes('..'), 'Repository-relative path required')
const schema = z.object({
  schemaVersion: z.literal(1),
  purpose: z.string().min(1),
  paidPresentationOwner: z.string().min(1),
  freePresentationOwner: z.string().min(1),
  runtimePolicyOwner: z.string().min(1),
  liveStripeVerification: z.string().min(1),
  features: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/),
    referenceLabel: z.string().min(1),
    pricingComparison: z.enum(['included', 'not-shown', 'pending-owner']),
    labelStatus: z.enum(['existing-vocabulary-review-before-publication', 'owner-approved']),
    availability: z.object({ free: availability, growth: availability }).strict(),
    currentBehavior: z.string().min(1),
    entitlementKeys: z.array(z.string().min(1)),
    mcpOperations: z.array(z.string().min(1)),
    verification: z.object({
      status: z.enum(['source-reviewed', 'runtime-tested', 'pending-verification']),
      baseline: z.string().regex(/^[a-f0-9]{40}$/),
      sources: z.array(relativePath).min(1),
      tests: z.array(relativePath),
      coverageNote: z.string().min(1),
      evidenceSha256: z.record(relativePath, z.string().regex(/^[a-f0-9]{64}$/)),
    }).strict(),
    pendingOwnerDecision: z.string().min(1).nullable(),
  }).strict()).min(1),
}).strict()

/** Validate mappings against canonical runtime references, never publish copy. */
export function validateFeatureLibrary(input, { root, entitlementKeys, mcpOperations }) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
  const errors = []
  const ids = new Set()
  const mappedOperations = new Set()
  const knownEntitlements = new Set(entitlementKeys)
  const knownOperations = new Set(mcpOperations)
  for (const feature of parsed.data.features) {
    if (ids.has(feature.id)) errors.push(`Duplicate feature id: ${feature.id}`)
    ids.add(feature.id)
    for (const [field, values, known] of [
      ['entitlement', feature.entitlementKeys, knownEntitlements],
      ['MCP operation', feature.mcpOperations, knownOperations],
    ]) {
      const seen = new Set()
      for (const value of values) {
        if (seen.has(value)) errors.push(`${feature.id}: duplicate ${field} ${value}`)
        if (!known.has(value)) errors.push(`${feature.id}: unknown ${field} ${value}`)
        seen.add(value)
      }
    }
    feature.mcpOperations.forEach(operation => mappedOperations.add(operation))
    if (feature.verification.status === 'runtime-tested' && feature.verification.tests.length === 0) {
      errors.push(`${feature.id}: runtime-tested requires a test reference`)
    }
    for (const [kind, paths] of [['source', feature.verification.sources], ['test', feature.verification.tests]]) {
      if (new Set(paths).size !== paths.length) errors.push(`${feature.id}: duplicate ${kind} evidence reference`)
    }
    const evidence = new Set([...feature.verification.sources, ...feature.verification.tests])
    for (const file of Object.keys(feature.verification.evidenceSha256)) {
      if (!evidence.has(file)) errors.push(`${feature.id}: hash has no evidence reference: ${file}`)
    }
    for (const file of evidence) {
      if (feature.verification.tests.includes(file) && !/^tests\/.+\.(?:test|spec)\.[cm]?[jt]s$/.test(file)) {
        errors.push(`${feature.id}: invalid test reference: ${file}`)
      }
      try {
        const digest = createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')
        if (feature.verification.evidenceSha256[file] !== digest) errors.push(`${feature.id}: stale evidence ${file}; review behavior and update the evidence hash`)
      } catch {
        errors.push(`${feature.id}: missing evidence file ${file}`)
      }
    }
  }
  for (const operation of knownOperations) {
    if (!mappedOperations.has(operation)) errors.push(`Unmapped public MCP operation: ${operation}; add/review a feature entry`)
  }
  return errors
}

/** Verify the reviewed comparison mapping without generating paid copy. */
export function validatePricingComparison(library, groups) {
  const features = new Map(library.features.map(feature => [feature.id, feature]))
  const mapped = new Set()
  const labels = new Set()
  const errors = []
  for (const group of groups) for (const row of group.rows) {
    const feature = features.get(row.id)
    if (!feature) { errors.push(`Unknown comparison feature: ${row.id}`); continue }
    mapped.add(row.id)
    if (labels.has(row.label)) errors.push(`Duplicate comparison label: ${row.label}`)
    labels.add(row.label)
    if (feature.pricingComparison !== 'included') errors.push(`${row.id}: comparison publication decision required`)
    if (row.entitlement && !feature.entitlementKeys.includes(row.entitlement)) errors.push(`${row.id}: comparison entitlement ${row.entitlement} has no feature mapping`)
    if (feature.availability.growth === 'unsupported' || feature.verification.status === 'pending-verification') errors.push(`${row.id}: unverified/unsupported comparison claim`)
  }
  for (const feature of library.features) {
    if (feature.pricingComparison === 'included' && !mapped.has(feature.id)) errors.push(`${feature.id}: reviewed comparison row is missing`)
  }
  return errors
}
