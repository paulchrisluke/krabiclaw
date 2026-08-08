export function canProceedWithTenantPageTransition(dirty: boolean, confirmDiscard: () => boolean): boolean {
  return !dirty || confirmDiscard()
}

export function previewHrefForTenantPage(dirty: boolean, href: string): string | undefined {
  return dirty ? undefined : href || undefined
}

export function createTenantPageRequestGate() {
  let current = 0
  return {
    begin() {
      current += 1
      return current
    },
    isCurrent(token: number) {
      return token === current
    },
    invalidate() {
      current += 1
    },
  }
}
