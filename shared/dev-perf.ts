export function isDevPerfHostAllowed(hostname: string, requestHostHeader: string | undefined, hasCfRay: boolean): boolean {
  const allowedHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', 'local.krabiclaw.com'])
  const reqHost = requestHostHeader ? (requestHostHeader.split(':')[0] || '') : ''
  const isLocalWranglerPlatformHost = reqHost === 'krabiclaw.com' && !hasCfRay
  return allowedHosts.has(hostname) || allowedHosts.has(reqHost) || isLocalWranglerPlatformHost
}
