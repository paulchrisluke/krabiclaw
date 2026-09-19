<template>
  <div class="flex min-h-screen items-center justify-center bg-muted px-4">
    <UCard class="w-full max-w-md">
      <template #header>
        <h1 class="text-base font-semibold text-highlighted">Add a site</h1>
        <p class="text-sm text-muted">Create another site under {{ orgSlug }}.</p>
      </template>

      <form class="space-y-4" @submit.prevent="submit">
        <UFormField label="Site name">
          <UInput v-model="name" placeholder="My Second Business" autofocus />
        </UFormField>
        <UFormField label="Subdomain">
          <UInput v-model="subdomain" placeholder="my-second-business" />
        </UFormField>
        <UFormField label="Vertical">
          <USelect v-model="vertical" :items="VERTICAL_OPTIONS" value-key="value" label-key="label" />
        </UFormField>
        <UFormField label="Currency" description="Prices on this site are quoted in this currency.">
          <USelect
            :model-value="defaultCurrency ?? undefined"
            :items="CURRENCY_OPTIONS"
            value-key="value"
            label-key="label"
            placeholder="Select currency"
            @update:model-value="defaultCurrency = $event ?? null"
          />
        </UFormField>
        <UAlert v-if="error" color="error" variant="soft" :description="error" />
      </form>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="creating" @click="router.push(`/dashboard/${orgSlug}`)">
            Cancel
          </UButton>
          <UButton :loading="creating" @click="submit">Create site</UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const dashboardApi = useDashboardApi()
import type { SiteVertical } from '~/utils/vertical-copy'
import { CURRENCY_OPTIONS, type CurrencyCode } from '~/shared/currencies'

definePageMeta({ layout: 'dashboard' })

// Options list, not a bare ALL_VERTICALS import — the picker needs
// human-readable labels, but the *values* are still driven by the single
// canonical vertical list (utils/vertical-copy.ts's ALL_VERTICALS /
// server/utils/site-creation.ts's VALID_VERTICALS) so a future vertical only
// needs a label added here, not a whole new value union.
const VERTICAL_OPTIONS: { label: string; value: SiteVertical }[] = [
  { label: 'Restaurant, café or bar', value: 'restaurant' },
  { label: 'Experience, class or activity', value: 'experience' },
  { label: 'Legal or professional services', value: 'service' },
]

const route = useRoute()
const router = useRouter()

const orgSlug = route.params.orgSlug as string
const name = ref('')
const subdomain = ref('')
const vertical = ref<SiteVertical>('restaurant')
// No preselected currency: this site is live the moment it is created, and a
// currency nobody chose would quote every price on it.
const defaultCurrency = ref<CurrencyCode | null>(null)
const creating = ref(false)
const error = ref<string | null>(null)

async function submit() {
  if (!name.value.trim() || !subdomain.value.trim()) {
    error.value = 'Name and subdomain are required'
    return
  }
  if (!defaultCurrency.value) {
    error.value = 'Choose the currency this site prices in'
    return
  }
  creating.value = true
  error.value = null
  try {
    const res = await dashboardApi<{
      siteId: string
      subdomain: string
      error?: string
    }>('/api/sites', {
      method: 'POST',
      body: { name: name.value.trim(), subdomain: subdomain.value.trim(), vertical: vertical.value, defaultCurrency: defaultCurrency.value },
      validate: (value): value is {
        siteId: string
        subdomain: string
        error?: string
      } =>
        isRecord(value)
        && typeof value.siteId === 'string'
        && typeof value.subdomain === 'string'
        && (value.error === undefined || typeof value.error === 'string'),
    })

    await router.push(`/dashboard/${orgSlug}/sites/${res.subdomain}`)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not create site. Please try again.'
  } finally {
    creating.value = false
  }
}
</script>
