<template>
  <!--
    Statements that take turns. The one in play is lit and the others stay
    muted; each has its own three pictures, and the row of them slides to the
    statement's set. Choosing a statement, or a set, plays that one and starts
    the timer again from it.
  -->
  <section
    v-if="statements.length"
    class="kc-showcase"
    data-parity-section="showcase"
    aria-roledescription="carousel"
    :aria-label="statements.map(statement => statement.text).join(' ')"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
    @focusin="paused = true"
    @focusout="paused = false"
  >
    <div class="kc-showcase__inner">
      <h2 class="kc-showcase__headline">
        <template v-for="(statement, index) in statements" :key="index">
          <button
            type="button"
            class="kc-showcase__statement"
            :class="{ 'kc-showcase__statement--active': index === active }"
            :aria-pressed="index === active"
            :aria-controls="galleryId"
            @click="select(index)"
          >{{ statement.text }}</button>{{ ' ' }}
        </template>
      </h2>

      <div :id="galleryId" class="kc-showcase__viewport">
        <div class="kc-showcase__track" :style="{ transform: `translateX(${-active * 100}%)` }">
          <div
            v-for="(statement, index) in statements"
            :key="index"
            class="kc-showcase__slide"
            role="group"
            aria-roledescription="slide"
            :aria-label="`${index + 1} of ${statements.length}: ${statement.text}`"
            :aria-hidden="index !== active"
            :inert="index !== active"
          >
            <figure
              v-for="picture in statement.pictures"
              :key="picture.slot"
              class="kc-showcase__card"
              :class="'kc-showcase__card--' + picture.slot"
            >
              <img
                v-if="picture.url"
                :src="picture.url"
                :alt="picture.alt"
                loading="lazy"
                decoding="async"
              >
              <!-- A picture not chosen yet is an empty frame, not a stand-in. -->
              <span v-else class="kc-showcase__empty">{{ picture.label }}</span>
            </figure>
          </div>
        </div>
      </div>

      <div class="kc-showcase__pager">
        <button
          v-for="(statement, index) in statements"
          :key="index"
          type="button"
          class="kc-showcase__dot"
          :class="{ 'kc-showcase__dot--active': index === active }"
          :aria-label="`Show ${statement.text}`"
          :aria-pressed="index === active"
          :aria-controls="galleryId"
          @click="select(index)"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { TENANT_PAGE_BLOCK_REGISTRY } from '~/utils/tenant-page-blocks'
import { blockRecords, blockText } from '~/utils/tenant-page-block-data'
import { mediaStillUrl } from '~/shared/media-placement-contract'

const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()

/** The pictures a statement holds, in the order the definition declares them. */
const PICTURE_FIELDS = Object.values(TENANT_PAGE_BLOCK_REGISTRY.showcase.fields.items?.of ?? {})
  .flatMap(field => (field.kind === 'media' && field.slot ? [{ slot: field.slot, label: field.label }] : []))

const statements = computed(() => blockRecords(props.block.data.items)
  .map((item, index) => ({
    text: blockText(item.title),
    pictures: PICTURE_FIELDS.map((field) => {
      const media = props.block.media.find(asset => asset.slot === `items.${index}.${field.slot}`)
      return { slot: field.slot, label: field.label, url: mediaStillUrl(media), alt: media?.alt_text ?? '' }
    }),
  }))
  .filter(statement => statement.text))

const galleryId = `kc-showcase-${props.block.id}`
const active = ref(0)
const paused = ref(false)

const AUTOPLAY_INTERVAL_MS = 4500
let timer: ReturnType<typeof setInterval> | null = null

function stop() {
  if (timer !== null) clearInterval(timer)
  timer = null
}

function start() {
  stop()
  if (statements.value.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  timer = setInterval(() => {
    if (!paused.value) active.value = (active.value + 1) % statements.value.length
  }, AUTOPLAY_INTERVAL_MS)
}

/** Plays the chosen statement and counts the next turn from now. */
function select(index: number) {
  active.value = index
  start()
}

onMounted(start)
onBeforeUnmount(stop)
</script>

<style scoped>
.kc-showcase {
  padding: clamp(4rem, 9vw, 7rem) 0;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.kc-showcase__inner {
  width: min(100% - clamp(2rem, 6vw, 6rem), 118rem);
  margin: 0 auto;
}

.kc-showcase__headline {
  max-width: 24ch;
  margin: 0 0 clamp(2.5rem, 5vw, 4rem);
  font-size: clamp(2.1rem, 5.2vw, 5rem);
  line-height: 1.18;
  letter-spacing: -0.02em;
  text-wrap: pretty;
}

.kc-showcase__statement {
  display: inline;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ui-text-dimmed);
  font: inherit;
  letter-spacing: inherit;
  text-align: inherit;
  cursor: pointer;
  transition: color 0.4s ease;
}

.kc-showcase__statement:hover {
  color: var(--ui-text-muted);
}

.kc-showcase__statement--active,
.kc-showcase__statement--active:hover {
  color: var(--ui-text-highlighted);
}

.kc-showcase__statement:focus-visible {
  border-radius: 0.25rem;
  outline: 2px solid var(--kc-coral-400);
  outline-offset: 4px;
}

.kc-showcase__viewport {
  overflow: hidden;
}

.kc-showcase__track {
  display: flex;
  transition: transform 0.6s cubic-bezier(0.65, 0, 0.35, 1);
}

.kc-showcase__slide {
  display: grid;
  flex: 0 0 100%;
  min-width: 0;
  grid-template-columns: 2.3fr 1fr 2.3fr;
  gap: clamp(0.75rem, 1.5vw, 1.5rem);
  height: clamp(18rem, 30vw, 36rem);
}

.kc-showcase__card {
  position: relative;
  margin: 0;
  overflow: hidden;
  border-radius: 1rem;
  background: var(--ui-bg-elevated);
}

.kc-showcase__card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.kc-showcase__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 1rem;
  border: 1px dashed var(--ui-border-accented);
  border-radius: inherit;
  color: var(--ui-text-dimmed);
  font-size: 0.875rem;
  text-align: center;
}

.kc-showcase__pager {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.kc-showcase__dot {
  width: 0.5rem;
  height: 0.5rem;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--ui-border-accented);
  cursor: pointer;
  transition: width 0.4s ease, background-color 0.4s ease;
}

.kc-showcase__dot--active {
  width: 1.75rem;
  background: var(--ui-text-highlighted);
}

/* Narrow screens keep each picture readable: the set scrolls sideways at a
   fixed height rather than shrinking three pictures into one row. */
@media (max-width: 767px) {
  .kc-showcase__slide {
    display: flex;
    height: 20rem;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }

  .kc-showcase__card {
    flex: 0 0 auto;
    scroll-snap-align: start;
  }

  .kc-showcase__card--left,
  .kc-showcase__card--right {
    width: 82%;
  }

  .kc-showcase__card--center {
    width: 46%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .kc-showcase__track,
  .kc-showcase__statement,
  .kc-showcase__dot {
    transition: none;
  }
}
</style>
