<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'max-w-lg' }">
    <template #content>
      <div v-if="unavailable" class="p-6">
        <UAlert color="error" variant="soft" icon="i-lucide-circle-alert" :description="unavailable" />
      </div>
      <div v-else-if="content" class="p-6">
        <!-- Team strip -->
        <div class="flex items-center gap-3 mb-5">
          <div class="flex -space-x-2">
            <UAvatar
              :src="PAUL_PHOTO_URL"
              alt="Paul"
              size="md"
              class="ring-2 ring-white dark:ring-gray-900"
            />
            <UAvatar
              :src="JULIA_PHOTO_URL"
              alt="Julia"
              size="md"
              class="ring-2 ring-white dark:ring-gray-900"
            />
          </div>
          <div>
            <p class="text-xs font-semibold text-muted uppercase tracking-wide">From Paul & Julia</p>
            <p class="text-xs text-dimmed">Your Krabiclaw team</p>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            class="ml-auto"
            aria-label="Close"
            @click="close"
          />
        </div>

        <!-- Headline -->
        <h2 class="text-xl font-bold text-highlighted leading-snug mb-1">
          {{ content.headline }}
        </h2>
        <p class="text-sm text-muted leading-relaxed mb-5">
          {{ content.subheading }}
        </p>

        <!-- Bullets -->
        <ul class="space-y-2 mb-6">
          <li v-for="bullet in content.bullets" :key="bullet" class="flex items-start gap-2 text-sm text-default">
            <UIcon name="i-lucide-circle-check" class="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{{ bullet }}</span>
          </li>
        </ul>

        <!-- Price callout -->
        <div v-if="content.price" class="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 mb-5 flex items-baseline gap-2">
          <span class="text-2xl font-extrabold text-primary">{{ content.price }}</span>
          <span class="text-sm text-muted">{{ content.priceNote }}</span>
        </div>

        <!-- CTAs -->
        <div class="flex flex-col gap-2">
          <UAlert
            v-if="error"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            :description="error"
            class="mb-2"
          />
          <UButton
            color="primary"
            block
            size="lg"
            :loading="loading"
            class="font-semibold"
            @click="handleCta"
          >
            {{ content.cta }}
          </UButton>
          <a
            :href="config.public.helpUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-center text-sm text-muted hover:text-default transition-colors py-1"
          >
            Questions? Visit our help page →
          </a>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()

// --- Team photo URLs ---
const PAUL_PHOTO_URL = 'https://res.cloudinary.com/pcl-labs/image/upload/v1714697364/PCL-Labs/1_qjKv1vv3WC6ckf3eTM0hZQ_1_nf3uuk.png'
const JULIA_PHOTO_URL = 'https://res.cloudinary.com/pcl-labs/image/upload/v1714706641/PCL-Labs/1682091954266_vrcx3n.webp'

const { isOpen, type, close } = useServiceUpsell()
const { startOrganizationCheckout } = useOrganizationSubscription()
const error = ref<string | null>(null)
const loading = ref(false)

watch(isOpen, (open) => {
  if (!open) error.value = null
})

const dashboard = useDashboardOrganization()
const { plans, displayPrice } = await usePlans()

interface UpsellContent {
  headline: string
  subheading: string
  bullets: string[]
  price: string
  priceNote: string
  cta: string
}

// A plan or monthly price that can't be read is the modal's own error, not a render crash.
const unavailable = computed(() => {
  if (!type.value) return null
  const plan = plans.value.find(plan => plan.id === type.value)
  return plan && displayPrice(plan, false) ? null : `The ${type.value} plan's monthly price could not be loaded.`
})
const content = computed<UpsellContent | null>(() => {
  if (!type.value || unavailable.value) return null
  const plan = plans.value.find(plan => plan.id === type.value)!
  const price = displayPrice(plan, false)!
  return {
    headline: `Get ${plan.name}`,
    subheading: plan.tagline,
    bullets: plan.features,
    price,
    priceNote: '/ month',
    cta: `Get ${plan.name} — ${price}/mo`,
  }
})

async function handleCta() {
  if (unavailable.value || !content.value) return
  error.value = null
  loading.value = true
  try {
    if (!type.value) throw new Error('Choose a plan before starting checkout')
    const organizationId = dashboard.organizationId.value
    if (!organizationId) throw new Error('Choose an organization before starting checkout')
    await startOrganizationCheckout(organizationId, type.value)
    close()
  } catch (err) {
    console.error('Checkout error:', err)
    error.value = 'Something went wrong. Please visit our help page.'
  } finally {
    loading.value = false
  }
}
</script>
