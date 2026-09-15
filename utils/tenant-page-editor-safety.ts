export function previewHrefForTenantPage(dirty: boolean, href: string): string | undefined {
  return dirty ? undefined : href || undefined
}
