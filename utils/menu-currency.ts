// Returns null on failure (including success: false) rather than a hardcoded
// 'THB' fallback — a failed fetch is not evidence the site's currency is THB,
// and silently returning it would overwrite a caller's already-known-correct
// value. Callers own the fallback decision for their own current state.
export async function fetchMenuCurrency(): Promise<string | null> {
  try {
    const response = await $fetch<{ success: boolean; settings: { default_currency?: string } }>(`/api/dashboard/settings`)
    return response.success ? response.settings?.default_currency ?? null : null
  } catch {
    return null
  }
}
