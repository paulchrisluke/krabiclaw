<template>
  <article
    data-tenant-page
    :data-template="template"
    :class="template === 'blawby' ? 'blawby-container min-h-screen bg-white text-gray-900' : 'mx-auto max-w-7xl px-4 py-16 text-default sm:px-6 lg:px-8'"
  >
    <section v-for="block in page.blocks" :key="block.id" :data-block-type="block.type" class="tenant-page-block">
      <template v-if="block.type === 'hero'">
        <div :class="template === 'blawby' ? 'py-20 text-center sm:py-28' : 'py-12 sm:py-20'">
          <p v-if="text(block.data.eyebrow)" class="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">{{ text(block.data.eyebrow) }}</p>
          <h1 class="text-4xl font-bold tracking-tight sm:text-6xl">{{ text(block.data.title) || page.title }}</h1>
          <p v-if="text(block.data.subtitle) || text(block.data.description) || page.summary" class="mx-auto mt-6 max-w-3xl text-lg leading-8 text-muted">
            {{ text(block.data.subtitle) || text(block.data.description) || page.summary }}
          </p>
          <TenantPageButton v-if="text(block.data.cta_label) && text(block.data.cta_url)" class="mt-8" :label="text(block.data.cta_label)" :url="text(block.data.cta_url)" />
          <img v-if="text(block.data.url)" :src="text(block.data.url)" :alt="text(block.data.alt) || page.title" class="mx-auto mt-10 max-h-[34rem] w-full rounded-3xl object-cover shadow-xl">
        </div>
      </template>

      <template v-else-if="block.type === 'heading'">
        <component :is="headingTag(block.data.level)" class="mt-12 text-3xl font-semibold tracking-tight">{{ text(block.data.text) || page.title }}</component>
      </template>

      <template v-else-if="block.type === 'markdown'">
        <div v-if="text(block.data.markdown) || text(block.data.content)" class="prose prose-lg mt-8 max-w-none whitespace-pre-wrap text-muted">{{ sanitize(text(block.data.markdown) || text(block.data.content)) }}</div>
      </template>

      <template v-else-if="block.type === 'image'">
        <figure v-if="text(block.data.url)" class="my-12">
          <img :src="text(block.data.url)" :alt="text(block.data.alt) || page.title" class="w-full rounded-2xl object-cover shadow-lg">
          <figcaption v-if="text(block.data.caption)" class="mt-3 text-center text-sm text-muted">{{ text(block.data.caption) }}</figcaption>
        </figure>
      </template>

      <template v-else-if="block.type === 'gallery'">
        <div v-if="galleryImages(block).length" class="my-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <figure v-for="image in galleryImages(block)" :key="image.id || image.url">
            <img :src="image.url" :alt="image.alt || page.title" class="aspect-[4/3] w-full rounded-2xl object-cover">
            <figcaption v-if="image.caption" class="mt-2 text-sm text-muted">{{ image.caption }}</figcaption>
          </figure>
        </div>
      </template>

      <template v-else-if="block.type === 'faq'">
        <section v-if="faqItems(block).length" class="my-12">
          <h2 v-if="text(block.data.title)" class="mb-6 text-2xl font-semibold">{{ text(block.data.title) }}</h2>
          <div class="divide-y divide-default rounded-2xl border border-default">
            <details v-for="(item, index) in faqItems(block)" :key="item.question || index" class="p-5">
              <summary class="cursor-pointer font-semibold">{{ item.question }}</summary>
              <div v-if="item.answer" class="prose mt-3 max-w-none whitespace-pre-wrap text-muted">{{ sanitize(item.answer) }}</div>
            </details>
          </div>
        </section>
      </template>

      <template v-else-if="block.type === 'divider'">
        <hr class="my-12 border-default">
      </template>

      <template v-else-if="block.type === 'cta' || block.type === 'contact_cta' || block.type === 'booking_cta'">
        <section v-if="text(block.data.title) || text(block.data.description) || text(block.data.label)" class="my-12 rounded-3xl bg-elevated p-8 sm:p-12">
          <h2 v-if="text(block.data.title)" class="text-3xl font-semibold">{{ text(block.data.title) }}</h2>
          <p v-if="text(block.data.description)" class="mt-3 max-w-2xl text-muted">{{ text(block.data.description) }}</p>
          <TenantPageButton v-if="text(block.data.label) && text(block.data.url)" class="mt-6" :label="text(block.data.label)" :url="text(block.data.url)" />
        </section>
      </template>

      <template v-else-if="block.type === 'callout'">
        <aside v-if="text(block.data.title) || text(block.data.body)" class="my-10 rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <h2 v-if="text(block.data.title)" class="text-xl font-semibold">{{ text(block.data.title) }}</h2>
          <div v-if="text(block.data.body)" class="prose mt-2 max-w-none whitespace-pre-wrap text-muted">{{ sanitize(text(block.data.body)) }}</div>
        </aside>
      </template>

      <template v-else-if="block.type === 'button_group'">
        <div v-if="buttons(block).length" class="my-8 flex flex-wrap gap-3">
          <TenantPageButton v-for="button in buttons(block)" :key="button.url + button.label" :label="button.label" :url="button.url" />
        </div>
      </template>

      <template v-else-if="block.type === 'feature_grid' || block.type === 'testimonial_grid' || block.type === 'offering_grid' || block.type === 'location_grid'">
        <section v-if="gridItems(block).length" class="my-12">
          <h2 v-if="text(block.data.title)" class="mb-6 text-2xl font-semibold">{{ text(block.data.title) }}</h2>
          <div class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <article v-for="(item, index) in gridItems(block)" :key="item.id || item.title || index" class="rounded-2xl border border-default bg-default p-6 shadow-sm">
              <img v-if="item.image_url" :src="item.image_url" :alt="item.title || page.title" class="mb-5 aspect-[4/3] w-full rounded-xl object-cover">
              <p v-if="item.value" class="text-3xl font-bold text-primary">{{ item.value }}</p>
              <h3 v-if="item.title" class="text-lg font-semibold">{{ item.title }}</h3>
              <p v-if="item.description" class="mt-2 text-sm leading-6 text-muted">{{ item.description }}</p>
              <TenantPageButton v-if="item.url && item.label" class="mt-4" :label="item.label" :url="item.url" />
            </article>
          </div>
        </section>
      </template>

      <template v-else-if="block.type === 'donation_choices'">
        <section v-if="gridItems(block).length" class="my-12">
          <h2 v-if="text(block.data.title)" class="text-2xl font-semibold">{{ text(block.data.title) }}</h2>
          <p v-if="text(block.data.description)" class="mt-2 text-muted">{{ text(block.data.description) }}</p>
          <div class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <article v-for="(item, index) in gridItems(block)" :key="item.id || item.title || index" class="rounded-2xl border border-default p-6">
              <p v-if="item.amount" class="text-3xl font-bold text-primary">{{ item.amount }}</p>
              <h3 class="mt-2 font-semibold">{{ item.title }}</h3>
              <p v-if="item.description" class="mt-2 text-sm text-muted">{{ item.description }}</p>
            </article>
          </div>
        </section>
      </template>
    </section>
  </article>
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'

defineProps<{ page: PublicTenantPage; template: 'saya' | 'blawby' }>()
const sanitizer = useHtmlSanitizer()

type GridItem = { id?: string; title?: string; description?: string; value?: string; image_url?: string; label?: string; url?: string; amount?: string }

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function sanitize(value: string): string {
  return sanitizer.sanitize(value)
}

function headingTag(value: unknown): string {
  const level = Number(value)
  return `h${Number.isInteger(level) && level >= 1 && level <= 6 ? level : 2}`
}

function galleryImages(block: TenantPageBlock): Array<{ id?: string; url: string; alt?: string; caption?: string }> {
  const value = block.data.images
  if (!Array.isArray(value)) return []
  return value.filter((item): item is { id?: string; url: string; alt?: string; caption?: string } => Boolean(item && typeof item === 'object' && typeof (item as Record<string, unknown>).url === 'string'))
}

function asItems(value: unknown): GridItem[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))).map(item => ({
    id: text(item.id) || undefined,
    title: text(item.title) || text(item.name) || undefined,
    description: text(item.description) || text(item.summary) || text(item.body) || undefined,
    value: text(item.value) || undefined,
    image_url: text(item.image_url) || text(item.url) || undefined,
    label: text(item.label) || text(item.cta_label) || undefined,
    url: text(item.url) || text(item.cta_url) || undefined,
    amount: item.amount == null ? undefined : String(item.amount),
  }))
}

function gridItems(block: TenantPageBlock): GridItem[] {
  return asItems(block.data.items ?? block.data.features ?? block.data.statistics ?? block.data.plans ?? block.data.tiers ?? block.data.people)
}

function faqItems(block: TenantPageBlock): Array<{ question: string; answer: string }> {
  return asItems(block.data.items ?? block.data.faqs).map(item => ({ question: item.title || '', answer: item.description || '' })).filter(item => item.question)
}

function buttons(block: TenantPageBlock): Array<{ label: string; url: string }> {
  if (!Array.isArray(block.data.buttons)) return []
  return block.data.buttons.filter((button): button is Record<string, unknown> => Boolean(button && typeof button === 'object')).map(button => ({ label: text(button.label), url: text(button.url) })).filter(button => button.label && button.url)
}
</script>
