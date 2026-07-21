export async function fetchMenuCurrency(): Promise<string> {
  try {
    const response = await $fetch<{ success: boolean; settings: { default_currency?: string } }>(`/api/dashboard/settings`)
    return (response.success && response.settings?.default_currency) || 'THB'
  } catch {
    return 'THB'
  }
}
