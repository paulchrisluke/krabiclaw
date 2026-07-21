<template>
  <UDashboardPanel id="site-translations">
    <template #header>
      <UDashboardNavbar title="Translations">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-6 text-sm text-muted">{{ headerDescription }}</p>
      <div class="max-w-2xl space-y-6">
        <!-- No site yet -->
        <UAlert
          v-if="!siteId"
          color="neutral"
          variant="soft"
          icon="i-lucide-languages"
          title="No site yet"
          description="Translations will be available after your site workspace is set up."
        />

        <!-- Free plan → upsell -->
        <template v-else-if="isFree">
          <UCard>
            <div class="flex flex-col items-center text-center gap-4 py-4">
              <div class="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <UIcon name="i-lucide-languages" class="size-7" />
              </div>
              <div>
                <h2 class="text-lg font-bold text-highlighted">Translations are included in Growth</h2>
                <p class="mt-1 text-sm text-muted max-w-md">
                  Upgrade to Growth and we'll translate your entire site into one language — menu, pages, and all.
                  You focus on the site, we handle the words.
                </p>
              </div>
              <div class="flex flex-col sm:flex-row gap-3">
                <UButton color="primary" size="lg" @click="openUpsell('growth', 'translations-page')">
                  Get Growth — $49/mo
                </UButton>
                <UButton color="neutral" variant="soft" size="lg" :to="config.public.helpUrl" target="_blank" rel="noopener noreferrer">
                  Visit help page
                </UButton>
              </div>
            </div>
          </UCard>
        </template>

        <!-- Growth plan — translation request fulfillment isn't available right now -->
        <template v-else-if="isGrowth">
          <UCard v-if="!managedServiceEnabled">
            <div class="flex flex-col items-center text-center gap-4 py-4">
              <div class="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <UIcon name="i-lucide-languages" class="size-7" />
              </div>
              <div>
                <h2 class="text-lg font-bold text-highlighted">Translations aren't available yet</h2>
                <p class="mt-1 text-sm text-muted max-w-md">
                  We're not taking translation requests right now. For anything urgent, visit our help page.
                </p>
              </div>
              <UButton color="neutral" variant="soft" size="lg" :to="config.public.helpUrl" target="_blank" rel="noopener noreferrer">
                Visit help page
              </UButton>
            </div>
          </UCard>

          <template v-else>
            <UCard>
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-languages" class="size-5" />
                </div>
                <div class="flex-1 min-w-0">
                  <h2 class="font-bold text-highlighted">1 language translation included</h2>
                  <p class="mt-1 text-sm text-muted">Your Growth plan includes one full site translation. Tell us which language and we'll get it done.</p>
                </div>
              </div>

              <div v-if="activeLocales.length" class="mt-5 space-y-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-muted">Active language</p>
                <div
                  v-for="locale in activeLocales"
                  :key="locale.locale"
                  class="flex items-center justify-between rounded-lg border border-default px-4 py-3"
                >
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-circle-check" class="size-4 text-success" />
                    <span class="font-medium text-default">{{ localeLabel(locale.locale) }}</span>
                    <UBadge :color="locale.status === 'published' ? 'success' : 'warning'" variant="soft" size="xs">
                      {{ locale.status }}
                    </UBadge>
                  </div>
                  <UButton size="xs" color="neutral" variant="soft" :to="config.public.helpUrl" target="_blank" rel="noopener noreferrer">
                    Request update
                  </UButton>
                </div>
              </div>

              <div v-else class="mt-5">
                <p class="text-sm font-medium text-default mb-3">Which language would you like?</p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <UButton
                    v-for="option in popularLocales"
                    :key="option.value"
                    color="neutral"
                    variant="outline"
                    :to="config.public.helpUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="justify-start"
                  >
                    {{ option.label }}
                  </UButton>
                </div>
                <p class="mt-3 text-xs text-muted">Need a different language? <a :href="config.public.helpUrl" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Visit our help page</a></p>
              </div>
            </UCard>

            <UCard v-if="activeLocales.length === 0 && managedPlan">
              <div class="flex items-start gap-3">
                <UIcon name="i-lucide-info" class="size-5 text-primary shrink-0 mt-0.5" />
                <p class="text-sm text-muted">
                  Want unlimited languages and full managed service?
                  <button class="text-primary hover:underline font-medium" @click="openUpsell('managed', 'translations-page')">Upgrade to Managed ({{ managedPriceLabel }})</button>
                </p>
              </div>
            </UCard>
          </template>
        </template>

        <!-- Managed / SEO Accelerator — unlimited -->
        <template v-else>
          <UCard>
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <UIcon name="i-lucide-languages" class="size-5" />
              </div>
              <div class="flex-1 min-w-0">
                <h2 class="font-bold text-highlighted">Unlimited translations included</h2>
                <p class="mt-1 text-sm text-muted">We manage all your translations. Request a new language any time — we handle the rest.</p>
              </div>
            </div>

            <div v-if="activeLocales.length" class="mt-5 space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">Active languages</p>
              <div
                v-for="locale in activeLocales"
                :key="locale.locale"
                class="flex items-center justify-between rounded-lg border border-default px-4 py-3"
              >
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-circle-check" class="size-4 text-success" />
                  <span class="font-medium text-default">{{ localeLabel(locale.locale) }}</span>
                  <UBadge :color="locale.status === 'published' ? 'success' : 'warning'" variant="soft" size="xs">
                    {{ locale.status }}
                  </UBadge>
                </div>
                <UButton size="xs" color="neutral" variant="soft" :to="config.public.helpUrl" target="_blank" rel="noopener noreferrer">
                  Request update
                </UButton>
              </div>
            </div>

            <div class="mt-5 pt-4 border-t border-default flex items-center justify-between">
              <p class="text-sm text-muted">Need another language?</p>
              <UButton
              color="primary"
              variant="soft"
              icon="i-lucide-plus"
              :to="config.public.helpUrl"
              target="_blank"
              rel="noopener noreferrer"
              >
                Request a language
              </UButton>
            </div>
          </UCard>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const config = useRuntimeConfig()
const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()

const siteId = computed(() => dashboard.siteId.value ?? '')
const plan = computed(() => dashboard.site.value?.plan ?? 'free')

const isFree = computed(() => !plan.value || plan.value === 'free')
const isGrowth = computed(() => plan.value === 'growth')
const managedServiceEnabled = dashboard.managedServiceEnabled

const { open: openUpsell } = useServiceUpsell()
const { managedPlan, monthlyPrice, formatPrice } = usePlans()
const managedPriceLabel = computed(() => {
  const cents = managedPlan.value ? monthlyPrice(managedPlan.value) : null
  return cents !== null ? `${formatPrice(cents)}/mo` : 'contact us'
})

const headerDescription = computed(() => {
  if (isFree.value) return 'Reach more tourists by translating your site into their language.'
  if (isGrowth.value) {
    return managedServiceEnabled.value
      ? 'Your Growth plan includes one full site translation, managed by our team.'
      : "Translation requests aren't available right now."
  }
  return 'Unlimited translations, managed by Paul & Julia. Request any language anytime.'
})

const popularLocales = [
  { label: 'English', value: 'en' },
  { label: 'Thai', value: 'th' },
  { label: 'Chinese', value: 'zh-CN' },
  { label: 'German', value: 'de' },
  { label: 'Japanese', value: 'ja' },
  { label: 'French', value: 'fr' },
]

const localeMap: Record<string, string> = {
  en: 'English', th: 'Thai', 'zh-CN': 'Chinese (Simplified)',
  de: 'German', ja: 'Japanese', fr: 'French',
  ko: 'Korean', es: 'Spanish', ar: 'Arabic', it: 'Italian',
}

function localeLabel(locale: string) {
  return localeMap[locale] ?? locale
}

interface SiteLocaleRow {
  locale: string
  label: string | null
  is_source: boolean
  status: 'draft' | 'published' | 'disabled'
}

const activeLocales = ref<SiteLocaleRow[]>([])

onMounted(async () => {
  if (!siteId.value) return
  try {
    const response = await $fetch<{ success: boolean; source_locale: string; locales: SiteLocaleRow[] }>(
      '/api/dashboard/editor/locales'
    )
    activeLocales.value = (response.locales ?? []).filter(l => !l.is_source && l.status !== 'disabled')
  } catch {
    // silently ignore — locales section just won't show
  }
})

useSeoMeta({ title: 'Translations | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
