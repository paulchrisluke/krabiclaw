<template>
  <UPage>
    <UPageBody>
      <div class="max-w-2xl space-y-6">

        <!-- Free plan upsell -->
        <template v-if="isFree">
          <UCard>
            <div class="flex flex-col items-center text-center gap-4 py-4">
              <div class="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <UIcon name="i-lucide-headphones" class="size-7" />
              </div>
              <div>
                <h2 class="text-lg font-bold text-highlighted">Managed support is included in Growth</h2>
                <p class="mt-1 text-sm text-muted max-w-md">
                  Upgrade and Paul & Julia handle your updates, translations, and Google presence.
                  Send a WhatsApp — we take care of the rest.
                </p>
              </div>
              <div class="flex flex-col sm:flex-row gap-3">
                <UButton color="primary" size="lg" @click="openUpsell('growth', 'support-page')">
                  Get Growth — $49/mo
                </UButton>
                <UButton color="neutral" variant="soft" size="lg" :href="whatsappLink" target="_blank">
                  Ask us on WhatsApp
                </UButton>
              </div>
            </div>
          </UCard>
        </template>

        <!-- Managed plans — request form + history -->
        <template v-else>
          <!-- New request form -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-plus-circle" class="size-5" />
                </div>
                <div>
                  <h2 class="font-semibold text-highlighted">Submit a request</h2>
                  <p class="text-sm text-muted">We'll take care of it — usually within 1–2 business days.</p>
                </div>
              </div>
            </template>

            <div class="space-y-4">
              <UFormField label="What do you need?">
                <USelect
                  v-model="form.type"
                  :items="typeOptions"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Summary">
                <UInput v-model="form.title" placeholder="e.g. Add new lunch menu, Update opening hours" class="w-full" maxlength="120" />
              </UFormField>

              <UFormField label="Details (optional)">
                <UTextarea
                  v-model="form.description"
                  placeholder="Any specific requirements, photos to use, languages needed, deadlines, etc."
                  :rows="3"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Priority">
                <div class="flex gap-2">
                  <UButton
                    v-for="p in priorities"
                    :key="p.value"
                    :color="form.priority === p.value ? 'primary' : 'neutral'"
                    :variant="form.priority === p.value ? 'soft' : 'ghost'"
                    size="sm"
                    @click="form.priority = p.value"
                  >
                    {{ p.label }}
                  </UButton>
                </div>
              </UFormField>

              <div class="flex items-center gap-3">
                <UButton :loading="submitting" @click="submitRequest">
                  Submit request
                </UButton>
                <p class="text-xs text-muted">Or message us directly on <a :href="whatsappLink" target="_blank" class="text-primary hover:underline">WhatsApp</a></p>
              </div>

              <UAlert v-if="submitError" color="error" variant="soft" :description="submitError" />
              <UAlert v-if="submitSuccess" color="success" variant="soft" icon="i-lucide-check-circle" description="Request submitted — we'll get on it shortly." />
            </div>
          </UCard>

          <!-- Request history -->
          <UCard v-if="requests && requests.length > 0">
            <template #header>
              <h2 class="font-semibold text-highlighted">Your requests</h2>
            </template>
            <div class="divide-y divide-default">
              <div v-for="req in requests" :key="req.id" class="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" :class="typeColor(req.type)">
                  <UIcon :name="typeIcon(req.type)" class="size-4" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="font-medium text-default">{{ req.title }}</p>
                    <UBadge :label="statusLabel(req.status)" :color="statusColor(req.status)" variant="soft" size="xs" />
                  </div>
                  <p class="text-xs text-muted mt-0.5">{{ typeLabel(req.type) }} · {{ formatDate(req.created_at) }}</p>
                  <p v-if="req.notes" class="text-sm text-primary mt-1">{{ req.notes }}</p>
                </div>
              </div>
            </div>
          </UCard>
        </template>

      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const WHATSAPP_NUMBER = '16197200000'
const whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi Paul & Julia, I need some help with my restaurant site.')}`

const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()
const plan = computed(() => dashboard.site.value?.plan ?? 'free')
const isFree = computed(() => !plan.value || plan.value === 'free')
const { open: openUpsell } = useServiceUpsell()

const TYPE_LABELS: Record<string, string> = {
  content_update: 'Content update', menu_update: 'Menu update',
  translation: 'Translation', seo: 'SEO',
  google_business: 'Google Business', seasonal: 'Seasonal campaign',
  photo_update: 'Photos', social_media: 'Social media',
  technical: 'Technical', other: 'Other',
}
const TYPE_ICONS: Record<string, string> = {
  content_update: 'i-lucide-file-text', menu_update: 'i-lucide-utensils',
  translation: 'i-lucide-languages', seo: 'i-lucide-trending-up',
  google_business: 'i-lucide-map-pin', seasonal: 'i-lucide-sparkles',
  photo_update: 'i-lucide-image', social_media: 'i-lucide-share-2',
  technical: 'i-lucide-wrench', other: 'i-lucide-circle-help',
}
const TYPE_COLORS: Record<string, string> = {
  content_update: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600',
  menu_update: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600',
  translation: 'bg-violet-50 dark:bg-violet-950/40 text-violet-600',
  seo: 'bg-green-50 dark:bg-green-950/40 text-green-600',
  google_business: 'bg-red-50 dark:bg-red-950/40 text-red-500',
  seasonal: 'bg-orange-50 dark:bg-orange-950/40 text-orange-500',
  photo_update: 'bg-pink-50 dark:bg-pink-950/40 text-pink-500',
  social_media: 'bg-sky-50 dark:bg-sky-950/40 text-sky-500',
  technical: 'bg-slate-50 dark:bg-slate-950/40 text-slate-500',
  other: 'bg-muted text-muted',
}

const typeOptions = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))
const priorities = [
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
  { label: 'Urgent', value: 'urgent' },
]

const form = reactive({ type: 'content_update', title: '', description: '', priority: 'normal' })
const submitting = ref(false)
const submitError = ref('')
const submitSuccess = ref(false)

function typeLabel(type: string) { return TYPE_LABELS[type] ?? type }
function typeIcon(type: string) { return TYPE_ICONS[type] ?? 'i-lucide-circle-help' }
function typeColor(type: string) { return TYPE_COLORS[type] ?? 'bg-muted text-muted' }

function statusLabel(status: string) {
  return { pending: 'Pending', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled' }[status] ?? status
}
function statusColor(status: string): 'neutral' | 'primary' | 'success' | 'error' {
  return { pending: 'neutral', in_progress: 'primary', done: 'success', cancelled: 'error' }[status] as 'neutral' | 'primary' | 'success' | 'error' ?? 'neutral'
}

function formatDate(val: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(val))
}

interface WorkRequest {
  id: string; type: string; title: string; status: string
  notes: string | null; created_at: string
}

const { data, refresh } = await useFetch<{ requests: WorkRequest[] }>('/api/dashboard/work-requests')
const requests = computed(() => data.value?.requests)

async function submitRequest() {
  if (!form.title.trim()) { submitError.value = 'Please enter a summary.'; return }
  submitting.value = true
  submitError.value = ''
  submitSuccess.value = false
  try {
    await $fetch('/api/dashboard/work-requests', {
      method: 'POST',
      body: { type: form.type, title: form.title.trim(), description: form.description.trim() || undefined, priority: form.priority },
    })
    form.title = ''
    form.description = ''
    form.priority = 'normal'
    submitSuccess.value = true
    await refresh()
  } catch (err: unknown) {
    submitError.value = err instanceof Error ? err.message : 'Failed to submit request.'
  } finally {
    submitting.value = false
  }
}

useSeoMeta({ title: 'Support | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
