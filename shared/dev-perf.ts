export function isDevPerfHostAllowed(
  requestHostHeader: string | undefined,
  hasCfRay: boolean,
  publicTestPageEnabled = false,
): boolean {
  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'local.krabiclaw.com'])
  // Strip port and IPv6 brackets from the raw Host header value so callers
  // don't need to normalise before calling this function.
  const raw = requestHostHeader ?? ''
  // IPv6: [::1]:8787 → ::1
  const reqHost = raw.startsWith('[') ? (raw.slice(1, raw.indexOf(']')) || raw) : (raw.split(':')[0] || '')
  const isLocalWranglerPlatformHost = reqHost === 'krabiclaw.com' && !hasCfRay
  const isKrabiClawOwnedHost = reqHost === 'krabiclaw.com' || reqHost.endsWith('.krabiclaw.com') || reqHost.endsWith('.workers.dev')
  return allowedHosts.has(reqHost) || isLocalWranglerPlatformHost || (publicTestPageEnabled && isKrabiClawOwnedHost)
}
