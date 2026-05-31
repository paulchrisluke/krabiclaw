<template>
  <UPage>
    <UPageBody>
      <div class="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 class="text-2xl font-bold text-highlighted">Welcome to Your New Site</h1>
          <p class="mt-1 text-sm text-muted">Let's get your site set up with social media sync.</p>
        </div>
        <!-- Progress Steps -->
        <div class="flex items-center justify-between gap-2">
          <div
            v-for="(step, i) in steps"
            :key="i"
            class="flex-1 flex items-center gap-2"
          >
            <div
              :class="[
                'flex size-8 items-center justify-center rounded-full text-sm font-medium',
                currentStep >= i ? 'bg-primary text-inverted' : 'bg-muted text-muted'
              ]"
            >
              {{ currentStep > i ? '✓' : i + 1 }}
            </div>
            <span
              :class="[
                'text-sm font-medium',
                currentStep === i ? 'text-highlighted' : 'text-muted'
              ]"
            >
              {{ step }}
            </span>
          </div>
        </div>

        <!-- Step 1: Link Social Media -->
        <UCard v-if="currentStep === 0">
          <template #header>
            <h2 class="text-lg font-semibold">Link Your Social Media</h2>
          </template>

          <div class="space-y-4">
            <p class="text-sm text-muted">
              Connect your Facebook Page and Instagram Business Account to automatically sync your posts to your website.
              This means you can just post to Facebook or Instagram, and your content will appear on your site automatically - no need to manually create posts in the dashboard.
            </p>

            <div class="rounded-lg bg-elevated p-4 space-y-3">
              <div class="flex items-start gap-3">
                <UIcon name="i-simple-icons-facebook" class="size-5 text-primary mt-0.5" />
                <div>
                  <p class="font-medium text-highlighted">Facebook Page</p>
                  <p class="text-sm text-muted">Sync your Facebook posts automatically</p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <UIcon name="i-simple-icons-instagram" class="size-5 text-primary mt-0.5" />
                <div>
                  <p class="font-medium text-highlighted">Instagram Business Account</p>
                  <p class="text-sm text-muted">Sync your Instagram posts automatically</p>
                </div>
              </div>
            </div>

            <UAlert color="info" variant="soft" icon="i-heroicons-information-circle">
              Sync runs hourly - just post to your social media and we'll handle the rest.
            </UAlert>

            <div class="flex justify-end gap-3">
              <UButton variant="ghost" @click="skipStep">
                Skip for now
              </UButton>
              <UButton @click="goToSettings">
                Connect Social Media
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Step 2: Verify Site Content -->
        <UCard v-if="currentStep === 1">
          <template #header>
            <h2 class="text-lg font-semibold">Verify Your Site Content</h2>
          </template>

          <div class="space-y-4">
            <p class="text-sm text-muted">
              Take a moment to review your live site and make sure everything looks correct.
            </p>

            <div class="rounded-lg border border-default overflow-hidden">
              <iframe
                :src="liveSiteUrl"
                title="Live site preview"
                class="w-full h-96"
                frameborder="0"
              />
            </div>

            <div class="flex justify-end gap-3">
              <UButton variant="ghost" @click="previousStep">
                Back
              </UButton>
              <UButton @click="nextStep">
                Looks Good
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Step 3: Complete Setup -->
        <UCard v-if="currentStep === 2">
          <template #header>
            <h2 class="text-lg font-semibold">Setup Complete!</h2>
          </template>

          <div class="space-y-4">
            <p class="text-sm text-muted">
              Your site is ready. Here's what you can do next:
            </p>

            <div class="space-y-3">
              <NuxtLink
                :to="liveSiteUrl"
                target="_blank"
                class="flex items-center gap-3 rounded-lg border border-default p-4 hover:bg-elevated transition"
              >
                <UIcon name="i-heroicons-globe-alt" class="size-5 text-primary" />
                <div class="flex-1">
                  <p class="font-medium text-highlighted">View Your Live Site</p>
                  <p class="text-sm text-muted">{{ liveSiteUrl }}</p>
                </div>
                <UIcon name="i-heroicons-arrow-up-right" class="size-4 text-muted" />
              </NuxtLink>

              <NuxtLink
                :to="`/dashboard/${route.params.orgSlug}`"
                class="flex items-center gap-3 rounded-lg border border-default p-4 hover:bg-elevated transition"
              >
                <UIcon name="i-heroicons-squares-plus" class="size-5 text-primary" />
                <div class="flex-1">
                  <p class="font-medium text-highlighted">Go to Dashboard</p>
                  <p class="text-sm text-muted">Manage your site content and settings</p>
                </div>
                <UIcon name="i-heroicons-arrow-right" class="size-4 text-muted" />
              </NuxtLink>
            </div>

            <div class="flex justify-end">
              <UButton @click="completeOnboarding">
                Complete Setup
              </UButton>
            </div>
          </div>
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const router = useRouter()
const dashboard = useDashboardRestaurant()

const toast = useToast()
const currentStep = ref(0)
const steps = ['Link Social Media', 'Verify Site', 'Complete']
const _queryHandled = ref(false)

const liveSiteUrl = computed(() => {
  if (!dashboard.restaurant.value) return '#'
  const slug = dashboard.restaurant.value.slug
  return `https://${slug}.krabiclaw.com`
})

const goToSettings = () => {
  router.push(`/dashboard/${route.params.orgSlug}/~/settings/general`)
}

const skipStep = () => {
  nextStep()
}

const nextStep = () => {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++
  }
}

const previousStep = () => {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

const completeOnboarding = async () => {
  try {
    await $fetch('/api/dashboard/onboarding/complete', { method: 'POST' })
    router.push(`/dashboard/${route.params.orgSlug}`)
  } catch (err) {
    console.error('Failed to complete onboarding:', err)
    const toast = useToast()
    toast.add({ 
      description: 'Failed to complete onboarding. Please try again.', 
      color: 'error' 
    })
  }
}

onMounted(async () => {
  await dashboard.refresh()
  if (_queryHandled.value) return
  // Surface payment or transfer query notifications from redirect flows
  try {
    if (String(route.query.payment) === 'cancelled') {
      if (typeof toast.addToast === 'function') {
        toast.addToast('Payment cancelled — your subscription was not completed. Retry from Billing.', 'info')
      } else if (typeof toast.add === 'function') {
        toast.add({ title: 'Payment cancelled', description: 'Your subscription was not completed. You can retry from the billing page when ready.', color: 'warning' })
      }
    }

    if (String(route.query.new) === 'true') {
      if (typeof toast.addToast === 'function') {
        toast.addToast('Welcome — your site has been created. Complete onboarding to publish content.', 'success')
      } else if (typeof toast.add === 'function') {
        toast.add({ title: 'Welcome', description: 'Your site has been created. Complete onboarding to publish content.', color: 'success' })
      }
    }
  } finally {
    _queryHandled.value = true
  }
})
</script>
