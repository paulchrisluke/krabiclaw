<template>
  <div class="p-4 lg:p-6">
    <div class="mb-6 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-default">{{ title }}</h1>
        <p v-if="publicPath" class="mt-1 text-sm text-muted">{{ publicPath }}</p>
      </div>
      <UButton :to="backUrl" color="neutral" variant="soft" icon="i-lucide-arrow-left">{{ backLabel }}</UButton>
    </div>

    <UCard v-if="loadPending">
      <div class="flex items-center gap-3 text-sm text-muted">
        <UIcon name="i-lucide-refresh-cw" class="size-4 animate-spin" />
        Loading post...
      </div>
    </UCard>

    <UAlert
      v-else-if="loadError"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :description="loadError"
    />

    <UCard v-else>
      <BlogPostForm ref="formRef" v-model="form" :free-text-category="props.freeTextCategory">
        <template #media-picker="slotProps">
          <component
            :is="props.mediaPickerComponent || PlatformMediaPicker"
            v-bind="{ ...slotProps, ...(props.mediaPickerComponent ? { siteId: props.siteId } : {}) }"
          />
        </template>
      </BlogPostForm>

      <div v-if="errorMessage || successMessage" class="mt-4 space-y-2">
        <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="errorMessage" />
        <UAlert v-if="successMessage" color="success" variant="soft" icon="i-lucide-circle-check" :description="successMessage" />
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-default pt-4">
        <UButton v-if="isEdit" color="neutral" variant="soft" :loading="saving" :disabled="!canSave" @click="update(false)">
          Save changes
        </UButton>
        <UButton v-if="isEdit" :loading="saving" :disabled="!canPublish" @click="update(true)">
          Publish
        </UButton>
        <UButton v-if="isEdit && post?.published_at" color="neutral" variant="ghost" :loading="saving" @click="unpublish">
          Unpublish
        </UButton>
        <UButton v-if="isEdit" color="error" variant="ghost" :loading="saving" @click="remove">
          Delete
        </UButton>
        <UButton v-if="!isEdit" color="neutral" variant="soft" :loading="saving" :disabled="!canSave" @click="save(false)">
          Save draft
        </UButton>
        <UButton v-if="!isEdit" :loading="saving" :disabled="!canPublish" @click="save(true)">
          Publish
        </UButton>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import { getErrorMessage } from '~/utils/errors'
import { parseOptionalNumber } from '~/utils/optional-number'
import { getBlogPostPath } from '~/utils/blog-categories'
import BlogPostForm from './BlogPostForm.vue'
import PlatformMediaPicker from '~/components/workspace/media/PlatformMediaPicker.vue'
import type { BlogPostRepository, BlogPost, BlogComponent, PlatformBlogCreateInput, PlatformBlogUpdateInput } from './types'

type BlogForm = InstanceType<typeof BlogPostForm>['$props']['modelValue']

interface Props {
  repository: BlogPostRepository
  postId?: string
  siteId?: string
  isEdit?: boolean
  title?: string
  backUrl?: string
  backLabel?: string
  mediaPickerComponent?: Component
  freeTextCategory?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  postId: undefined,
  siteId: undefined,
  isEdit: false,
  title: 'Blog Post',
  backUrl: '/admin',
  backLabel: 'Admin',
  mediaPickerComponent: undefined,
  freeTextCategory: false,
})

const route = useRoute()
const postId = computed(() => props.postId || String(route.params.postId || ''))
const categoryEdited = ref(false)
const categoryInitialized = ref(false)

const formRef = ref<InstanceType<typeof BlogPostForm>>()
const form = ref<BlogForm>({
  title: '',
  excerpt: '',
  category: '',
  nav_section: '',
  nav_title: '',
  nav_order: '',
  nav_section_order: '',
  hide_from_nav: false,
  featured_order: '',
  seo_description: '',
  seo_keywords: '',
  canonical_url: '',
  robots: '',
  body: '',
  featured_image_asset_id: '',
  faq_items: [],
  faq_label: '',
  faq_status: 'active',
  faq_render_enabled: true,
  faq_schema_enabled: true,
  how_to_steps: [],
  how_to_label: '',
  how_to_status: 'active',
  how_to_render_enabled: true,
  how_to_schema_enabled: true,
})

const post = ref<BlogPost | null>(null)
const publicPath = computed(() => {
  const category = categoryEdited.value ? form.value.category : (form.value.category || post.value?.category)
  if (categoryEdited.value) return getBlogPostPath(category, post.value?.slug) || 'Draft'
  return post.value?.public_path || getBlogPostPath(category, post.value?.slug) || 'Draft'
})
const loadPending = ref(props.isEdit)
const loadError = ref('')
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
let loadRequestSeq = 0
let saveRequestSeq = 0

const canSave = computed(() => Boolean(form.value.title.trim() || form.value.body.trim()))
const canPublish = computed(() => Boolean(form.value.title.trim() && form.value.body.trim()))

watch(() => form.value.category, () => {
  if (categoryInitialized.value) categoryEdited.value = true
})

watch(postId, () => {
  saveRequestSeq += 1
  saving.value = false
  if (postId.value && props.isEdit) loadPost()
}, { immediate: true })

function resetForm() {
  form.value = {
    title: '',
    excerpt: '',
    category: '',
    nav_section: '',
    nav_title: '',
    nav_order: '',
    nav_section_order: '',
    hide_from_nav: false,
    featured_order: '',
    seo_description: '',
    seo_keywords: '',
    canonical_url: '',
    robots: '',
    body: '',
    featured_image_asset_id: '',
    faq_items: [],
    faq_label: '',
    faq_status: 'active',
    faq_render_enabled: true,
    faq_schema_enabled: true,
    how_to_steps: [],
    how_to_label: '',
    how_to_status: 'active',
    how_to_render_enabled: true,
    how_to_schema_enabled: true,
  }
}

function hydrateStructuredContent(components: BlogComponent[] | undefined) {
  const faq = components?.find(component => component.type === 'faq')
  const howTo = components?.find(component => component.type === 'how_to')

  form.value.faq_items = faq?.data?.items?.map(item => ({
    question: item.question ?? '',
    answer: item.answer ?? '',
  })) ?? []
  form.value.faq_label = faq?.label ?? ''
  form.value.faq_status = faq?.status ?? 'active'
  form.value.faq_render_enabled = faq?.render_enabled ?? true
  form.value.faq_schema_enabled = faq?.schema_enabled ?? true

  form.value.how_to_steps = howTo?.data?.steps?.map(step => ({
    name: step.name ?? '',
    text: step.text ?? '',
    image_asset_id: step.image_asset_id ?? '',
    url: step.url ?? '',
  })) ?? []
  form.value.how_to_label = howTo?.label ?? ''
  form.value.how_to_status = howTo?.status ?? 'active'
  form.value.how_to_render_enabled = howTo?.render_enabled ?? true
  form.value.how_to_schema_enabled = howTo?.schema_enabled ?? true
}

function buildPayload(): PlatformBlogCreateInput | PlatformBlogUpdateInput {
  return {
    ...form.value,
    canonical_url: form.value.canonical_url.trim() || null,
    robots: form.value.robots.trim() || null,
    nav_section: form.value.nav_section.trim() || null,
    nav_title: form.value.nav_title.trim() || null,
    nav_order: parseOptionalNumber(form.value.nav_order),
    nav_section_order: parseOptionalNumber(form.value.nav_section_order),
    featured_order: parseOptionalNumber(form.value.featured_order),
    faq_items: form.value.faq_items
      .map(item => ({ question: item.question.trim(), answer: item.answer.trim() }))
      .filter(item => item.question && item.answer),
    how_to_steps: form.value.how_to_steps
      .map(step => ({
        name: step.name.trim(),
        text: step.text.trim(),
        image_asset_id: step.image_asset_id.trim() || undefined,
        url: step.url.trim() || undefined,
      }))
      .filter(step => step.name && step.text),
  }
}

async function loadPost() {
  const requestPostId = postId.value
  if (!requestPostId) return
  const requestSeq = ++loadRequestSeq
  loadPending.value = true
  loadError.value = ''
  categoryEdited.value = false
  categoryInitialized.value = false
  post.value = null
  resetForm()
  try {
    const loadedPost = await props.repository.get(requestPostId)
    if (requestSeq !== loadRequestSeq || requestPostId !== postId.value) return
    post.value = loadedPost
    form.value.title = loadedPost.title
    form.value.excerpt = loadedPost.excerpt ?? ''
    form.value.category = loadedPost.category ?? ''
    form.value.nav_section = loadedPost.nav_section ?? ''
    form.value.nav_title = loadedPost.nav_title ?? ''
    form.value.nav_order = loadedPost.nav_order != null ? String(loadedPost.nav_order) : ''
    form.value.nav_section_order = loadedPost.nav_section_order != null ? String(loadedPost.nav_section_order) : ''
    form.value.hide_from_nav = Boolean(loadedPost.hide_from_nav)
    form.value.featured_order = loadedPost.featured_order != null ? String(loadedPost.featured_order) : ''
    form.value.seo_description = loadedPost.seo_description ?? ''
    form.value.seo_keywords = loadedPost.seo_keywords ?? ''
    form.value.canonical_url = loadedPost.canonical_url ?? ''
    form.value.robots = loadedPost.robots ?? ''
    form.value.featured_image_asset_id = loadedPost.featured_image_asset_id ?? ''
    form.value.body = loadedPost.body
    hydrateStructuredContent(loadedPost.components)
    categoryInitialized.value = true
  } catch (err) {
    if (requestSeq !== loadRequestSeq || requestPostId !== postId.value) return
    loadError.value = getErrorMessage(err, 'Failed to load post.')
  } finally {
    if (requestSeq === loadRequestSeq && requestPostId === postId.value) {
      loadPending.value = false
    }
  }
}

async function update(publish = false) {
  if (publish && !canPublish.value) {
    errorMessage.value = 'Title and body are required to publish.'
    return
  }
  if (!publish && !canSave.value) {
    errorMessage.value = 'Title or body is required to save a draft.'
    return
  }
  const requestPostId = postId.value
  if (!requestPostId) return
  const requestSeq = ++saveRequestSeq
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const updated = await props.repository.update(requestPostId, { ...buildPayload(), ...(publish ? { publish: true } : {}) } as PlatformBlogUpdateInput)
    if (requestSeq !== saveRequestSeq || requestPostId !== postId.value) return
    post.value = updated
    hydrateStructuredContent(updated.components)
    successMessage.value = publish ? 'Published.' : 'Saved.'
  } catch (err) {
    if (requestSeq !== saveRequestSeq || requestPostId !== postId.value) return
    errorMessage.value = getErrorMessage(err, 'Failed to save.')
  } finally {
    if (requestSeq === saveRequestSeq && requestPostId === postId.value) {
      saving.value = false
    }
  }
}

async function unpublish() {
  const requestPostId = postId.value
  if (!requestPostId) return
  const requestSeq = ++saveRequestSeq
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    await props.repository.unpublish(requestPostId)
    const updated = await props.repository.get(requestPostId)
    if (requestSeq !== saveRequestSeq || requestPostId !== postId.value) return
    post.value = updated
    hydrateStructuredContent(updated.components)
    successMessage.value = 'Post unpublished.'
  } catch (err) {
    if (requestSeq !== saveRequestSeq || requestPostId !== postId.value) return
    errorMessage.value = getErrorMessage(err, 'Failed to unpublish.')
  } finally {
    if (requestSeq === saveRequestSeq && requestPostId === postId.value) {
      saving.value = false
    }
  }
}

async function remove() {
  if (!confirm('Delete this post permanently?')) return
  saving.value = true
  errorMessage.value = ''
  try {
    await props.repository.delete(postId.value)
    await navigateTo(props.backUrl)
  } catch (err) {
    errorMessage.value = getErrorMessage(err, 'Failed to delete.')
  } finally {
    saving.value = false
  }
}

async function save(publish: boolean) {
  if (publish && !canPublish.value) {
    errorMessage.value = 'Title and body are required to publish.'
    return
  }
  if (!publish && !canSave.value) {
    errorMessage.value = 'Title or body is required to save a draft.'
    return
  }

  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const payload = { ...buildPayload(), publish } as PlatformBlogCreateInput
    const res = await props.repository.create(payload)
    await navigateTo(props.repository.editUrl(res.id))
  } catch (err) {
    errorMessage.value = getErrorMessage(err, publish ? 'Failed to publish.' : 'Failed to save draft.')
  } finally {
    saving.value = false
  }
}
</script>
