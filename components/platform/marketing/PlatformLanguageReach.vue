<template>
  <!--
    The languages a site speaks, one at a time: its flag lit on the left, the
    site in that language at the front of the stack, and the places its readers
    find it marked on the map. The languages take turns; choosing a flag plays
    that one and starts the timer again from it.
  -->
  <section
    v-if="languages.length"
    class="kc-reach"
    data-parity-section="language-reach"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
    @focusin="paused = true"
    @focusout="paused = false"
  >
    <div class="kc-reach__inner">
      <h2 v-if="title" class="kc-reach__heading">{{ title }}</h2>

      <div class="kc-reach__card">
        <div class="kc-reach__map" aria-hidden="true">
          <div class="kc-reach__dots" />
          <template v-for="(language, index) in languages" :key="language.locale">
            <span
              v-for="([x, y], pin) in language.pins"
              :key="`${language.locale}-${pin}`"
              class="kc-reach__pin"
              :class="{ 'kc-reach__pin--active': index === active }"
              :style="{ left: `${x}%`, top: `${y}%`, transitionDelay: index === active ? `${pin * 90}ms` : '0ms' }"
            >
              <span class="kc-reach__pin-dot" />
              <!-- One label per language: its cities sit close enough to overlap. -->
              <span v-if="pinLabel && pin === 0" class="kc-reach__pin-label">{{ pinLabel }}</span>
            </span>
          </template>
        </div>

        <ul class="kc-reach__flags" aria-label="Languages">
          <li v-for="(language, index) in languages" :key="language.locale">
            <button
              type="button"
              class="kc-reach__flag"
              :class="{ 'kc-reach__flag--active': index === active }"
              :aria-pressed="index === active"
              :aria-label="language.name"
              @click="select(index)"
            >
              <span aria-hidden="true">{{ language.flag }}</span>
            </button>
          </li>
        </ul>

        <div class="kc-reach__stack">
          <figure
            v-for="(language, index) in languages"
            :key="language.locale"
            class="kc-reach__site"
            :class="[`kc-reach__site--${place(index)}`, !language.image && 'kc-reach__site--empty']"
            :aria-hidden="index !== active"
          >
            <img v-if="language.image" :src="language.image" :alt="language.alt" loading="lazy" decoding="async">
            <span v-else class="kc-reach__site-empty">{{ language.name }}</span>
          </figure>
        </div>

        <div v-if="subtitle || description" class="kc-reach__copy">
          <h3 v-if="subtitle" class="kc-reach__title">{{ subtitle }}</h3>
          <p v-if="description" class="kc-reach__description">{{ description }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockMedia, blockRecords, blockText, blockTextOrNull } from '~/utils/tenant-page-block-data'
import { mediaStillUrl } from '~/shared/media-placement-contract'

const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()

/**
 * Where each language's readers are, as positions on public/platform/world-dots.svg
 * (percent of its width and height). Generated with dotted-map from the same
 * projection as the map: New York, London, Sydney, Toronto; Bangkok, Chiang Mai,
 * Phuket; Tokyo, Osaka, Sapporo.
 */
const LANGUAGE_PLACES: Record<string, { flag: string; pins: Array<[number, number]> }> = {
  en: { flag: '🇺🇸', pins: [[29.05, 34.64], [50, 24.25], [92.38, 81.41], [28.1, 31.18]] },
  th: { flag: '🇹🇭', pins: [[77.62, 51.96], [77.62, 48.5], [77.62, 55.43]] },
  ja: { flag: '🇯🇵', pins: [[89.05, 38.11], [88.1, 38.11], [89.52, 32.91]] },
}

const title = computed(() => blockTextOrNull(props.block.data.title))
const subtitle = computed(() => blockTextOrNull(props.block.data.subtitle))
const description = computed(() => blockTextOrNull(props.block.data.description))
const pinLabel = computed(() => blockTextOrNull(props.block.data.pin_label))

const languages = computed(() => blockRecords(props.block.data.items).flatMap((item, index) => {
  const locale = blockText(item.locale)
  const places = LANGUAGE_PLACES[locale]
  if (!places) return []
  const media = blockMedia(props.block, `items.${index}.image`)
  return [{ locale, name: blockText(item.title) || locale, flag: places.flag, pins: places.pins, image: mediaStillUrl(media), alt: media?.alt_text ?? '' }]
}))

const active = ref(0)
const paused = ref(false)

/** Front, the one before it behind on the left, the one after behind on the right. */
function place(index: number): 'front' | 'before' | 'after' | 'away' {
  const count = languages.value.length
  if (index === active.value) return 'front'
  if (index === (active.value - 1 + count) % count) return 'before'
  if (index === (active.value + 1) % count) return 'after'
  return 'away'
}

const AUTOPLAY_INTERVAL_MS = 4500
let timer: ReturnType<typeof setInterval> | null = null

function stop() {
  if (timer !== null) clearInterval(timer)
  timer = null
}

function start() {
  stop()
  if (languages.value.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  timer = setInterval(() => {
    if (!paused.value) active.value = (active.value + 1) % languages.value.length
  }, AUTOPLAY_INTERVAL_MS)
}

function select(index: number) {
  active.value = index
  start()
}

onMounted(start)
onBeforeUnmount(stop)
</script>

<style scoped>
.kc-reach {
  padding: clamp(4rem, 9vw, 7rem) 0;
  background: var(--ui-bg);
}

.kc-reach__inner {
  width: min(100% - clamp(2rem, 6vw, 6rem), 118rem);
  margin: 0 auto;
}

.kc-reach__heading {
  margin: 0 0 clamp(2rem, 4vw, 3.5rem);
  color: var(--ui-text-highlighted);
  font-size: clamp(2.4rem, 5.5vw, 5rem);
  letter-spacing: -0.03em;
  line-height: 1.05;
}

.kc-reach__card {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: 1fr auto;
  min-height: clamp(32rem, 48vw, 46rem);
  padding: clamp(1.5rem, 3.5vw, 3rem);
  overflow: hidden;
  border-radius: 2rem;
  background:
    radial-gradient(60% 70% at 30% 45%, color-mix(in srgb, var(--kc-navy-500) 45%, transparent) 0%, transparent 70%),
    linear-gradient(135deg, var(--kc-navy) 0%, var(--kc-navy-700) 55%, #05060d 100%);
  color: #fff;
}

/* The map sits behind everything, over the right-hand side of the card. */
.kc-reach__map {
  position: absolute;
  top: 12%;
  right: 0;
  width: 62%;
  aspect-ratio: 105 / 50;
}

.kc-reach__dots {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--kc-teal-400) 45%, transparent);
  mask: url('/platform/world-dots.svg') center / 100% 100% no-repeat;
}

.kc-reach__pin {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  opacity: 0;
  transform: translate(-0.35rem, -50%) scale(0.6);
  transition: opacity 0.4s ease, transform 0.4s ease;
}

.kc-reach__pin--active {
  opacity: 1;
  transform: translate(-0.35rem, -50%) scale(1);
}

.kc-reach__pin-dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 999px;
  background: var(--kc-coral-400);
  box-shadow: 0 0 0 0.35rem color-mix(in srgb, var(--kc-coral-400) 25%, transparent);
}

.kc-reach__pin-label {
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
}

.kc-reach__flags {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  grid-row: 1;
  margin: 0;
  padding: 0;
  list-style: none;
}

.kc-reach__flag {
  display: grid;
  place-items: center;
  width: clamp(3.5rem, 5vw, 4.5rem);
  aspect-ratio: 1;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 1rem;
  background: rgb(255 255 255 / 6%);
  font-size: clamp(1.6rem, 2.4vw, 2.1rem);
  line-height: 1;
  opacity: 0.45;
  cursor: pointer;
  transition: opacity 0.4s ease, background-color 0.4s ease, transform 0.4s ease;
}

.kc-reach__flag:hover {
  opacity: 0.75;
}

.kc-reach__flag--active,
.kc-reach__flag--active:hover {
  background: rgb(255 255 255 / 22%);
  opacity: 1;
  transform: scale(1.06);
}

.kc-reach__flag:focus-visible {
  outline: 2px solid var(--kc-coral-400);
  outline-offset: 3px;
}

/* The site in each language: one at the front, its neighbours behind it. */
.kc-reach__stack {
  position: relative;
  z-index: 1;
  grid-row: 1;
  grid-column: 2;
  width: min(100%, 22rem);
  margin-left: clamp(1rem, 8vw, 9rem);
  aspect-ratio: 4 / 5;
  align-self: center;
}

.kc-reach__site {
  position: absolute;
  inset: 0;
  margin: 0;
  overflow: hidden;
  border: 0.5rem solid #fff;
  border-radius: 1rem;
  background: #fff;
  box-shadow: 0 24px 60px rgb(0 0 0 / 40%);
  transition: transform 0.6s cubic-bezier(0.65, 0, 0.35, 1), opacity 0.6s ease, filter 0.6s ease;
}

.kc-reach__site img {
  width: 100%;
  height: 100%;
  border-radius: 0.5rem;
  object-fit: cover;
}

.kc-reach__site--front {
  z-index: 3;
}

.kc-reach__site--before {
  z-index: 2;
  opacity: 0.45;
  filter: saturate(0.6);
  transform: translateX(-22%) scale(0.86);
}

.kc-reach__site--after {
  z-index: 1;
  opacity: 0.3;
  filter: saturate(0.6);
  transform: translateX(22%) scale(0.86);
}

.kc-reach__site--away {
  z-index: 0;
  opacity: 0;
  transform: scale(0.8);
}

.kc-reach__site--empty {
  border: 1px dashed rgb(255 255 255 / 18%);
  background: var(--kc-navy-700);
  box-shadow: 0 24px 60px rgb(0 0 0 / 35%);
}

.kc-reach__site-empty {
  display: grid;
  place-items: center;
  height: 100%;
  color: rgb(255 255 255 / 45%);
  font-size: 0.875rem;
}

.kc-reach__copy {
  position: relative;
  z-index: 2;
  grid-column: 1 / -1;
  max-width: 44rem;
  margin-top: 2rem;
}

.kc-reach__title {
  margin: 0;
  color: #fff;
  font-size: clamp(1.25rem, 1.8vw, 1.6rem);
  font-weight: 500;
}

.kc-reach__description {
  margin: 0.75rem 0 0;
  color: rgb(255 255 255 / 62%);
  font-size: clamp(1rem, 1.5vw, 1.35rem);
  line-height: 1.55;
}

@media (max-width: 767px) {
  .kc-reach__card {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto auto;
  }

  .kc-reach__map {
    position: relative;
    top: auto;
    grid-row: 3;
    width: 100%;
    margin-top: 1.5rem;
  }

  .kc-reach__flags {
    flex-direction: row;
  }

  .kc-reach__stack {
    grid-row: 2;
    grid-column: 1;
    width: 70%;
    margin: 2rem auto 0;
  }

  .kc-reach__copy {
    grid-row: 4;
  }
}

@media (prefers-reduced-motion: reduce) {
  .kc-reach__pin,
  .kc-reach__flag,
  .kc-reach__site {
    transition: none;
  }
}
</style>
