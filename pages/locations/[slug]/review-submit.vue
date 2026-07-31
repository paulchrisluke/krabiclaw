<template>
  <div class="min-h-screen bg-default text-default">
    <section class="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <NuxtLink :to="`/locations/${slug}`" class="saya-kicker text-muted no-underline hover:text-default">
        Back to {{ requestData?.location?.title || 'location' }}
      </NuxtLink>

      <div v-if="pending" class="mt-12 rounded-lg border border-default p-8">
        <div class="h-5 w-40 animate-pulse rounded bg-elevated" />
        <div class="mt-4 h-20 animate-pulse rounded bg-elevated" />
      </div>

      <div v-else-if="loadError" class="mt-12 rounded-lg border border-default p-8">
        <h1 class="text-2xl font-semibold">This review link is not available</h1>
        <p class="mt-3 text-sm text-muted">{{ loadError }}</p>
      </div>

      <div v-else-if="optedOut" class="mt-12 rounded-lg border border-default p-8">
        <h1 class="text-2xl font-semibold">You are opted out</h1>
        <p class="mt-3 text-sm text-muted">You will not receive more review request emails from {{ requestData?.site?.name || 'this business' }}.</p>
      </div>

      <div v-else-if="submitted" class="mt-12 rounded-lg border border-default p-8">
        <h1 class="text-3xl font-semibold">Thank you</h1>
        <p class="mt-3 text-sm text-muted">Your review is pending moderation.</p>
        <div class="mt-8 flex flex-wrap gap-3">
          <a v-if="requestData?.location?.googleReviewUrl" :href="requestData.location.googleReviewUrl" target="_blank" rel="noopener" class="inline-flex items-center justify-center gap-2 rounded-full bg-(--brand-color) px-6 py-3 text-sm font-medium text-(--brand-color-foreground) no-underline transition hover:opacity-90">
            Also share on Google
          </a>
          <SayaButton variant="outline" @click="linkAccount">
            Sign in to link this review
          </SayaButton>
        </div>
      </div>

      <form v-else class="mt-12 rounded-lg border border-default p-8" @submit.prevent="submitReview">
        <p class="saya-eyebrow text-muted">{{ requestData?.site?.name }}</p>
        <h1 class="mt-3 text-3xl font-semibold">How was your visit?</h1>
        <p class="mt-3 text-sm text-muted">{{ requestData?.location?.title }}</p>

        <div class="mt-8">
          <label class="text-sm font-medium">Rating</label>
          <div class="mt-3 flex gap-2">
            <button
              v-for="star in 5"
              :key="star"
              type="button"
              class="rounded-full p-2 transition hover:bg-elevated"
              :aria-label="`${star} star${star === 1 ? '' : 's'}`"
              @click="rating = star"
            >
              <SayaIcon name="star" solid class="size-8" :class="star <= rating ? 'text-primary' : 'text-muted'" />
            </button>
          </div>
        </div>

        <label class="mt-8 block text-sm font-medium">
          Title
          <input v-model="title" class="mt-2 w-full rounded-lg border border-default bg-default px-3 py-2 text-sm outline-none focus:border-primary" maxlength="120">
        </label>

        <label class="mt-6 block text-sm font-medium">
          Review
          <textarea v-model="content" class="mt-2 min-h-36 w-full rounded-lg border border-default bg-default px-3 py-2 text-sm outline-none focus:border-primary" maxlength="2000" required />
        </label>

        <div class="mt-6">
          <div class="flex items-center justify-between gap-3">
            <label class="text-sm font-medium" for="review-media">Photos and videos</label>
            <span class="text-xs text-muted">{{ imageCount }}/5 photos / {{ videoCount }}/2 videos</span>
          </div>
          <input
            id="review-media"
            ref="mediaInput"
            class="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
            multiple
            @change="handleMediaSelect"
          >
          <div class="mt-3 flex flex-wrap gap-3">
            <button type="button" class="rounded-lg border border-dashed border-default px-4 py-3 text-sm text-muted hover:border-primary hover:text-default" :disabled="uploadingMedia" @click="mediaInput?.click()">
              {{ uploadingMedia ? 'Uploading...' : 'Add media' }}
            </button>
            <div
              v-for="item in media"
              :key="item.assetId"
              class="relative h-20 w-20 overflow-hidden rounded-lg border border-default bg-elevated"
            >
              <img v-if="item.previewUrl && item.kind === 'image'" :src="item.previewUrl" alt="" class="h-full w-full object-cover">
              <div v-else class="flex h-full w-full items-center justify-center text-xs text-muted">Video</div>
              <button type="button" class="absolute right-1 top-1 rounded-full bg-default/90 px-1.5 text-xs" aria-label="Remove media" @click="removeMedia(item.assetId)">x</button>
            </div>
          </div>
          <p v-if="mediaError" class="mt-3 text-sm text-error">{{ mediaError }}</p>
        </div>

        <p v-if="submitError" class="mt-4 text-sm text-error">{{ submitError }}</p>

        <div class="mt-8 flex flex-wrap items-center gap-3">
          <SayaButton type="submit" :disabled="submitting">
            {{ submitting ? 'Submitting...' : 'Submit review' }}
          </SayaButton>
          <button type="button" class="text-sm text-muted underline-offset-4 hover:underline" @click="optOut">
            Opt out of review emails
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'

definePageMeta({ layout: 'saya' })

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const token = computed(() => String(route.query.token || ''))

const rating = ref(5)
const title = ref('')
const content = ref('')
const submitting = ref(false)
const submitted = ref(false)
const optedOut = ref(false)
const submitError = ref('')
const loadError = ref('')
const mediaError = ref('')
const uploadingMedia = ref(false)
const mediaInput = ref<HTMLInputElement | null>(null)
const media = ref<Array<{ assetId: string; kind: 'image' | 'video'; previewUrl: string | null }>>([])
const imageCount = computed(() => media.value.filter(item => item.kind === 'image').length)
const videoCount = computed(() => media.value.filter(item => item.kind === 'video').length)

const { data: requestData, pending } = await useFetch<{
  request: { id: string; bookingType: string; expiresAt: string }
  site: { id: string; name: string | null }
  location: { id: string | null; slug: string | null; title: string | null; googleReviewUrl: string | null }
  customer: { name: string | null }
}>('/api/public/review-requests/validate', {
  query: { token },
  server: true,
  onResponseError({ response }) {
    loadError.value = (response._data as { error?: string } | undefined)?.error || 'The link may have expired or already been used.'
  },
})

onMounted(async () => {
  if (route.query.optOut === '1' || route.query.optOut === 'true') {
    await optOut()
  }
  if (requestData.value?.request?.id) {
    try {
      await ensureCustomerSession()
    } catch (error) {
      submitError.value = error instanceof Error ? error.message : 'Could not initialize the review session.'
    }
  }
})

async function ensureCustomerSession() {
  if (!import.meta.client) return
  const current = await authClient.getSession()
  if (!current?.data?.user?.id) {
    const anonymousSignIn = (authClient.signIn as unknown as { anonymous?: () => Promise<unknown> }).anonymous
    if (!anonymousSignIn) throw new Error('Anonymous review sessions are not available.')
    await anonymousSignIn()
  }
  await publicApiMutation<{ success: true; requestId: string }>('/api/public/review-requests/bind-session', {
    method: 'POST',
    body: { token: token.value },
    validate: (value): value is { success: true; requestId: string } =>
      isRecord(value) && value.success === true && typeof value.requestId === 'string',
  })
}

async function handleMediaSelect(event: Event) {
  mediaError.value = ''
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length || !requestData.value?.request?.id) return

  uploadingMedia.value = true
  try {
    await ensureCustomerSession()
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        if (imageCount.value >= 5) throw new Error('You can upload up to 5 photos.')
        await uploadImage(file)
      } else if (file.type === 'video/mp4' || file.type === 'video/webm') {
        if (videoCount.value >= 2) throw new Error('You can upload up to 2 videos.')
        await uploadVideo(file)
      } else {
        throw new Error('Use JPG, PNG, WebP, MP4, or WebM files.')
      }
    }
  } catch (error) {
    mediaError.value = error instanceof Error ? error.message : 'Could not upload media.'
  } finally {
    uploadingMedia.value = false
  }
}

async function uploadImage(file: File) {
  const requestId = requestData.value?.request?.id
  if (!requestId) return
  const upload = await publicApiMutation<{ assetId: string; uploadUrl: string }>(`/api/public/review-requests/${requestId}/media/request-upload`, {
    method: 'POST',
    body: { token: token.value, kind: 'image', filename: file.name },
    validate: (value): value is { assetId: string; uploadUrl: string } =>
      isRecord(value)
      && typeof value.assetId === 'string'
      && typeof value.uploadUrl === 'string',
  })
  const form = new FormData()
  form.append('file', file)
  const uploaded = await fetch(upload.uploadUrl, { method: 'POST', body: form })
  if (!uploaded.ok) throw new Error('Image upload failed.')
  await publicApiMutation<{ id: string; publicUrl: string; thumbnailUrl: string }>(
    `/api/public/review-requests/${requestId}/media/${upload.assetId}/confirm`,
    {
    method: 'POST',
    body: { token: token.value },
    validate: (value): value is { id: string; publicUrl: string; thumbnailUrl: string } =>
      isRecord(value)
      && typeof value.id === 'string'
      && typeof value.publicUrl === 'string'
      && typeof value.thumbnailUrl === 'string',
    },
  )
  media.value.push({ assetId: upload.assetId, kind: 'image', previewUrl: URL.createObjectURL(file) })
}

async function uploadVideo(file: File) {
  const requestId = requestData.value?.request?.id
  if (!requestId) return
  if (file.size > 250 * 1024 * 1024) throw new Error('Videos must be under 250 MB.')
  const form = new FormData()
  form.append('token', token.value)
  form.append('file', file)
  const uploaded = await publicApiMutation<{ assetId: string }>(`/api/public/review-requests/${requestId}/media/upload`, {
    method: 'POST',
    body: form,
    validate: (value): value is { assetId: string } =>
      isRecord(value) && typeof value.assetId === 'string',
  })
  media.value.push({ assetId: uploaded.assetId, kind: 'video', previewUrl: null })
}

function removeMedia(assetId: string) {
  const item = media.value.find(entry => entry.assetId === assetId)
  if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
  media.value = media.value.filter(entry => entry.assetId !== assetId)
}

async function submitReview() {
  submitError.value = ''
  if (content.value.trim().length < 10) {
    submitError.value = 'Review text must be at least 10 characters.'
    return
  }
  submitting.value = true
  try {
    await ensureCustomerSession()
    await publicApiMutation<{ success: true; reviewId: string; status: 'pending' }>('/api/public/review-requests/submit', {
      method: 'POST',
      body: {
        token: token.value,
        rating: rating.value,
        title: title.value,
        content: content.value,
        mediaAssetIds: media.value.map(item => item.assetId),
      },
      validate: (value): value is { success: true; reviewId: string; status: 'pending' } =>
        isRecord(value)
        && value.success === true
        && typeof value.reviewId === 'string'
        && value.status === 'pending',
    })
    submitted.value = true
  } catch (error) {
    submitError.value = (error as { data?: { error?: string } })?.data?.error || 'Could not submit your review.'
  } finally {
    submitting.value = false
  }
}

async function linkAccount() {
  const callbackURL = `/locations/${slug.value}/review-submit?token=${encodeURIComponent(token.value)}`
  await authClient.signIn.social({ provider: 'google', callbackURL })
}

async function optOut() {
  submitError.value = ''
  try {
    await publicApiMutation<{ optedOut: true }>('/api/public/review-requests/opt-out', {
      method: 'POST',
      body: { token: token.value },
      validate: (value): value is { optedOut: true } =>
        isRecord(value) && value.optedOut === true,
    })
    optedOut.value = true
  } catch (error) {
    submitError.value = (error as { data?: { error?: string } })?.data?.error || 'Could not opt out.'
  }
}

useSeoMeta({ title: 'Leave a review', robots: 'noindex' })
</script>
