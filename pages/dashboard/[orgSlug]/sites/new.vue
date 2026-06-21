<template>
  <div class="flex min-h-screen items-center justify-center bg-muted px-4">
    <UCard class="w-full max-w-md">
      <template #header>
        <h1 class="text-base font-semibold text-highlighted">Add a site</h1>
        <p class="text-sm text-muted">Create another site under {{ orgSlug }}.</p>
      </template>

      <form class="space-y-4" @submit.prevent="submit">
        <UFormField label="Site name">
          <UInput v-model="name" placeholder="My Second Restaurant" autofocus />
        </UFormField>
        <UFormField label="Subdomain">
          <UInput v-model="subdomain" placeholder="my-second-restaurant" />
        </UFormField>
        <UFormField label="Vertical">
          <USelect v-model="vertical" :items="['restaurant', 'experience']" />
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
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const router = useRouter()
const { offerSubscribe } = useSiteSubscribe()

const orgSlug = route.params.orgSlug as string
const name = ref('')
const subdomain = ref('')
const vertical = ref<'restaurant' | 'experience'>('restaurant')
const creating = ref(false)
const error = ref<string | null>(null)

async function submit() {
  if (!name.value.trim() || !subdomain.value.trim()) {
    error.value = 'Name and subdomain are required'
    return
  }
  creating.value = true
  error.value = null
  try {
    const res = await $fetch<{
      siteId: string
      subdomain: string
      offerSubscribePlan: string | null
      error?: string
    }>('/api/sites', {
      method: 'POST',
      body: { name: name.value.trim(), subdomain: subdomain.value.trim(), vertical: vertical.value },
    })

    await router.push(`/dashboard/${orgSlug}/sites/${res.subdomain}`)
    if (res.offerSubscribePlan) {
      await offerSubscribe(res.siteId, res.offerSubscribePlan)
    }
  } catch (err) {
    const data = (err as { data?: { error?: string } })?.data
    error.value = data?.error ?? 'Could not create site. Please try again.'
  } finally {
    creating.value = false
  }
}
</script>
