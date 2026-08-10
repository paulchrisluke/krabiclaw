import type { WorkerVersionMetadata } from '@cloudflare/workers-types'

export const FULL_SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/i
export const WORKER_VERSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface DeploymentProvenance {
  sourceSha: string
  worker: WorkerVersionMetadata
}

export class DeploymentProvenanceError extends Error {
  readonly code = 'DEPLOYMENT_PROVENANCE_UNAVAILABLE'

  constructor(reason: string) {
    super(`Deployment provenance is unavailable: ${reason}`)
    this.name = 'DeploymentProvenanceError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isVersionTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Date.parse(value))
}

/**
 * Validate the Cloudflare version metadata binding and expose the immutable
 * source SHA carried in its tag. This intentionally has no database/runtime
 * dependencies so it can be used by the provenance endpoint before any app
 * bindings are inspected.
 */
export function readDeploymentProvenance(metadata: unknown): DeploymentProvenance {
  if (!isRecord(metadata)) {
    throw new DeploymentProvenanceError('version metadata binding is missing')
  }

  const id = metadata.id
  const tag = metadata.tag
  const timestamp = metadata.timestamp

  if (typeof id !== 'string' || !WORKER_VERSION_ID_PATTERN.test(id)) {
    throw new DeploymentProvenanceError('Worker version id is malformed')
  }
  if (typeof tag !== 'string' || !FULL_SOURCE_SHA_PATTERN.test(tag)) {
    throw new DeploymentProvenanceError('Worker version tag is not a full 40-hex source SHA')
  }
  if (!isVersionTimestamp(timestamp)) {
    throw new DeploymentProvenanceError('Worker version timestamp is malformed')
  }

  const canonicalTag = tag.toLowerCase()
  const worker: WorkerVersionMetadata = {
    id,
    tag: canonicalTag,
    timestamp,
  }

  return {
    sourceSha: canonicalTag,
    worker,
  }
}
