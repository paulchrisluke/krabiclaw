<template>
  <BlawbyCanonicalPage v-if="template === 'blawby' && isCanonicalBlawbyPage(page.path)" :page="page" />
  <article
    v-else
    data-tenant-page
    :data-parity-root="template === 'blawby' ? '' : undefined"
    :data-template="template"
    :class="template === 'blawby' ? 'blawby-container min-h-screen bg-white text-gray-900' : 'mx-auto max-w-7xl px-4 py-16 text-default sm:px-6 lg:px-8'"
  >
    <section v-for="block in page.blocks" :key="block.id" :data-block-type="block.type" :data-parity-section="sectionKey(block)" class="tenant-page-block">
      <template v-if="block.type === 'hero'">
        <div :class="template === 'blawby' ? 'py-20 text-center sm:py-28' : 'py-12 sm:py-20'">
          <p v-if="text(block.data.eyebrow)" class="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">{{ text(block.data.eyebrow) }}</p>
          <h1 class="text-4xl font-bold tracking-tight sm:text-6xl">{{ heroTitle(block) }}</h1>
          <p v-if="heroDescription(block)" class="mx-auto mt-6 max-w-3xl text-lg leading-8 text-muted">
            {{ heroDescription(block) }}
          </p>
          <TenantPageButton v-if="text(block.data.cta_label) && text(block.data.cta_url)" class="mt-8" :label="text(block.data.cta_label)" :url="text(block.data.cta_url)" />
          <video
            v-if="blockMedia(block, 'media')?.kind === 'video'"
            :src="blockMedia(block, 'media')!.public_url!"
            :poster="blockMedia(block, 'media')!.thumbnail_url ?? undefined"
            autoplay muted loop playsinline
            class="mx-auto mt-10 max-h-[34rem] w-full rounded-3xl object-cover shadow-xl"
          />
          <img v-else-if="blockMedia(block, 'media')" :src="blockMedia(block, 'media')!.public_url!" :alt="mediaAlt(block)" class="mx-auto mt-10 max-h-[34rem] w-full rounded-3xl object-cover shadow-xl">
        </div>
      </template>

      <TenantPageRichTextBlock v-else-if="block.type === 'heading' || block.type === 'markdown'" :block="block" />

      <template v-else-if="block.type === 'image'">
        <figure v-if="blockMedia(block, 'media')" class="my-12">
          <video
            v-if="blockMedia(block, 'media')?.kind === 'video'"
            :src="blockMedia(block, 'media')!.public_url!"
            :poster="blockMedia(block, 'media')!.thumbnail_url ?? undefined"
            autoplay muted loop playsinline
            class="w-full rounded-2xl object-cover shadow-lg"
          />
          <img v-else :src="blockMedia(block, 'media')!.public_url!" :alt="mediaAlt(block)" class="w-full rounded-2xl object-cover shadow-lg">
          <figcaption v-if="text(block.data.caption)" class="mt-3 text-center text-sm text-muted">{{ text(block.data.caption) }}</figcaption>
        </figure>
      </template>

      <template v-else-if="block.type === 'gallery'">
        <p v-if="text(block.data.caption)" class="mb-4 text-center text-sm text-muted">{{ text(block.data.caption) }}</p>
        <div v-if="galleryImages(block).length" class="my-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <figure v-for="image in galleryImages(block)" :key="image.id || image.url">
            <video
              v-if="image.kind === 'video'"
              :src="image.url"
              :poster="image.thumbnailUrl ?? undefined"
              autoplay muted loop playsinline
              class="aspect-[4/3] w-full rounded-2xl object-cover"
            />
            <img v-else :src="image.url" :alt="image.alt" class="aspect-[4/3] w-full rounded-2xl object-cover">
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
          <div v-if="buttons(block).length" class="mt-5 flex flex-wrap gap-3">
            <TenantPageButton v-for="button in buttons(block)" :key="button.url + button.label" :label="button.label" :url="button.url" />
          </div>
        </aside>
      </template>

      <template v-else-if="block.type === 'button_group'">
        <div v-if="buttons(block).length" class="my-8 flex flex-wrap gap-3">
          <TenantPageButton v-for="button in buttons(block)" :key="button.url + button.label" :label="button.label" :url="button.url" />
        </div>
      </template>

      <template v-else-if="block.type === 'feature_grid' && calculatorRows(block).length">
        <TenantPagePricingCalculator :rows="calculatorRows(block)" :note="calculatorNote(block)" />
      </template>

      <template v-else-if="block.type === 'feature_grid' || block.type === 'testimonial_grid' || block.type === 'offering_grid' || block.type === 'location_grid'">
        <section class="my-12">
          <h2 v-if="text(block.data.title)" class="mb-6 text-2xl font-semibold">{{ text(block.data.title) }}</h2>
          <div class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <article v-for="(item, index) in gridItems(block)" :key="item.id || item.title || index" class="rounded-2xl border border-default bg-default p-6 shadow-sm">
              <img v-if="gridItemMedia(item)" :src="gridItemMedia(item)!" :alt="item.title" class="mb-5 aspect-[4/3] w-full rounded-xl object-cover">
              <p v-if="item.value" class="text-3xl font-bold text-primary">{{ item.value }}</p>
              <h3 v-if="item.title" class="text-lg font-semibold">{{ item.title }}</h3>
              <p v-if="item.description" class="mt-2 text-sm leading-6 text-muted">{{ item.description }}</p>
              <TenantPageButton v-if="item.url && itemLabel(item)" class="mt-4" :label="itemLabel(item)" :url="item.url" />
            </article>
          </div>
          <p v-if="!gridItems(block).length" class="rounded-2xl border border-dashed border-default p-6 text-sm text-muted">This section has no published items yet.</p>
        </section>
      </template>

      <template v-else-if="block.type === 'donation_choices'">
        <section class="my-12">
          <h2 v-if="text(block.data.title)" class="text-2xl font-semibold">{{ text(block.data.title) }}</h2>
          <p v-if="text(block.data.description)" class="mt-2 text-muted">{{ text(block.data.description) }}</p>
          <div class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <article v-for="(item, index) in donationItems(block)" :key="item.id || item.title || index" class="rounded-2xl border border-default p-6">
              <p v-if="item.amount" class="text-3xl font-bold text-primary">{{ item.amount }}</p>
              <h3 class="mt-2 font-semibold">{{ item.title }}</h3>
              <p v-if="item.description" class="mt-2 text-sm text-muted">{{ item.description }}</p>
              <TenantPageButton v-if="text(block.data.destination) && item.amount" class="mt-5" :label="`Donate ${item.amount}`" :url="text(block.data.destination)" />
            </article>
            <article v-if="text(block.data.destination)" class="rounded-2xl border border-default p-6">
              <h3 class="font-semibold">Custom Amount</h3>
              <p class="mt-2 text-sm text-muted">Choose your own donation amount</p>
              <TenantPageButton class="mt-5" label="Donate custom amount" :url="text(block.data.destination)" />
            </article>
          </div>
          <p v-if="!donationItems(block).length" class="rounded-2xl border border-dashed border-default p-6 text-sm text-muted">Donation choices are not configured.</p>
        </section>
      </template>
    </section>
  </article>
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import BlawbyCanonicalPage from './BlawbyCanonicalPage.vue'

defineProps<{ page: PublicTenantPage; template: 'saya' | 'blawby' }>()
const sanitizer = useHtmlSanitizer()
const { t } = useI18n()

const canonicalBlawbyPaths = new Set(['/about', '/pricing', '/donate', '/policies/privacy', '/policies/terms', '/third-party-notices'])
const isCanonicalBlawbyPage = (path: string) => canonicalBlawbyPaths.has(path)

type GridItem = { id?: string; title?: string; description?: string; value?: string; media?: Array<{ slot?: string; public_url?: string | null; thumbnail_url?: string | null }>; label?: string; labelKey?: string; url?: string; amount?: string }

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function heroTitle(block: TenantPageBlock): string {
  return text(block.data.title)
}

function heroDescription(block: TenantPageBlock): string {
  return Object.hasOwn(block.data, 'subtitle')
    ? text(block.data.subtitle)
    : text(block.data.description)
}

function mediaAlt(block: TenantPageBlock): string {
  return blockMedia(block, 'media')?.alt_text?.trim() ?? ''
}

function sanitize(value: string): string {
  return sanitizer.sanitize(value)
}

function sectionKey(block: TenantPageBlock): string | undefined {
  return text(block.data.section) || undefined
}

function galleryImages(block: TenantPageBlock): Array<{ id?: string; url: string; alt?: string; caption?: string; kind?: string | null; thumbnailUrl?: string | null }> {
  return block.media
    .filter(item => item.slot === 'gallery' && item.public_url)
    .map(item => ({ id: item.asset_id, url: item.public_url!, alt: item.alt_text ?? undefined, kind: item.kind, thumbnailUrl: item.thumbnail_url }))
}

function blockMedia(block: TenantPageBlock, slot: string) {
  return block.media.find(item => item.slot === slot && item.public_url) ?? null
}

function asItems(value: unknown): GridItem[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))).map(item => ({
    id: text(item.id) || undefined,
    title: text(Object.hasOwn(item, 'title') ? item.title : item.name) || undefined,
    description: text(Object.hasOwn(item, 'description') ? item.description : Object.hasOwn(item, 'summary') ? item.summary : item.body) || undefined,
    value: text(item.value) || undefined,
    media: Array.isArray(item.media) ? item.media as GridItem['media'] : [],
    label: text(Object.hasOwn(item, 'label') ? item.label : item.cta_label) || undefined,
    labelKey: text(item.labelKey) || undefined,
    url: text(item.url) || text(item.cta_url) || undefined,
    amount: item.amount == null ? undefined : String(item.amount),
  }))
}

function itemLabel(item: GridItem): string {
  return item.labelKey ? t(item.labelKey) : item.label || ''
}

function gridItemMedia(item: GridItem) {
  const media = item.media ?? []
  const asset = media.find(candidate => ['thumbnail', 'hero', 'featured', 'cover'].includes(candidate.slot ?? '')) ?? media[0]
  return asset?.thumbnail_url || asset?.public_url || null
}

function gridItems(block: TenantPageBlock): GridItem[] {
  const items = block.type === 'feature_grid'
    ? asItems(block.data.items ?? block.data.features ?? block.data.statistics ?? block.data.people)
    : asItems(block.data.items)
  return items.map((item, index) => {
    const media = block.media.filter(asset => asset.slot === `items.${index}.image`)
    return { ...item, media: media.length ? media : item.media }
  })
}

function donationItems(block: TenantPageBlock): GridItem[] {
  return asItems(block.data.tiers)
}

function faqItems(block: TenantPageBlock): Array<{ question: string; answer: string }> {
  return asItems(block.data.items ?? block.data.faqs).map(item => ({ question: item.title || '', answer: item.description || '' })).filter(item => item.question)
}

function buttons(block: TenantPageBlock): Array<{ label: string; url: string }> {
  if (!Array.isArray(block.data.buttons)) return []
  return block.data.buttons.filter((button): button is Record<string, unknown> => Boolean(button && typeof button === 'object')).map(button => ({ label: text(button.label), url: text(button.url) })).filter(button => button.label && button.url)
}

function calculatorRows(block: TenantPageBlock): unknown[][] {
  const calculator = block.data.calculator
  if (!calculator || typeof calculator !== 'object' || Array.isArray(calculator)) return []
  const rows = (calculator as Record<string, unknown>).rows
  return Array.isArray(rows) ? rows.filter(Array.isArray) as unknown[][] : []
}

function calculatorNote(block: TenantPageBlock): string | undefined {
  const calculator = block.data.calculator
  if (!calculator || typeof calculator !== 'object' || Array.isArray(calculator)) return undefined
  const note = (calculator as Record<string, unknown>).note
  return typeof note === 'string' ? note : undefined
}
</script>
