export const WORKER_VERSION_OVERRIDE_HEADER = 'Cloudflare-Workers-Version-Overrides'

export function createWorkerVersionOverrideHeaders(versionId, workerName = 'krabiclaw') {
  if (versionId === null || versionId === undefined || String(versionId).trim() === '') return {}
  const version = String(versionId).trim()
  const name = String(workerName || 'krabiclaw').trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(version)) {
    throw new Error('Worker version override must be a UUID-like version id')
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    throw new Error('Worker name contains unsupported characters')
  }
  return { [WORKER_VERSION_OVERRIDE_HEADER]: `${name}="${version}"` }
}
