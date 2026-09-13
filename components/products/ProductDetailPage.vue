<template>
  <div class="min-h-screen bg-default text-default">
    <AppBreadcrumb :crumbs="breadcrumbs" />

    <!-- One responsive primary action: the mobile bar and the desktop card
         resolve the same booking, so the page never shows two of them. -->
    <div
      v-if="booking && isAvailable"
      class="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-default bg-default/95 px-5 py-4 shadow-lg backdrop-blur-sm lg:hidden"
    >
      <div v-if="priceLabel" class="min-w-0">
        <p v-if="compareAtLabel" class="text-xs text-muted line-through">{{ compareAtLabel }}</p>
        <p class="font-semibold leading-tight text-default">{{ priceLabel }}</p>
      </div>
      <SayaButton v-if="enquiryOnly" class="shrink-0" :to="enquiryPath">
        {{ t('saya.experience_detail.enquire') }}
      </SayaButton>
      <SayaButton v-else class="shrink-0" control-id="product-booking-toggle" @click="openBooking">
        {{ t('saya.experience_detail.book_now') }}
      </SayaButton>
    </div>

    <article :class="booking ? 'mx-auto max-w-7xl px-4 pb-28 sm:px-6 lg:px-8 lg:pb-20' : 'mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8'">
      <!-- A bookable product is read the way it is sold: the gallery and the
           prose on the left, and the price, the facts and the booking control
           travelling with the reader on the right. A product that takes no
           bookings has nothing to put in that column, so it keeps the single
           card. -->
      <div v-if="booking">
        <SayaMediaGallery :items="galleryItems" :title="product.name" />

        <!-- What it is, in one glance: name, tagline, how guests rate it,
             where it runs, how long, how many. Centred under the photographs
             the way the rest of Saya introduces a place. -->
        <header class="mx-auto mt-10 max-w-3xl text-center">
          <p class="saya-kicker mb-3">{{ collectionName }}</p>
          <h1 class="saya-display-md text-default">{{ product.name }}</h1>
          <p v-if="tagline" class="mx-auto mt-4 max-w-2xl text-base text-muted sm:text-lg">{{ tagline }}</p>
          <div class="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted">
              <template v-if="averageRating">
                <span class="inline-flex items-center gap-1 font-medium text-default">
                  <SayaIcon name="star" solid class="size-4" />{{ averageRating }}
                </span>
                <span aria-hidden="true">·</span>
                <span>{{ reviewCountLabel }}</span>
                <span aria-hidden="true">·</span>
              </template>
            <span>{{ location.title }}</span>
          </div>
          <div v-if="factChips.length" class="mt-5 flex flex-wrap justify-center gap-2">
            <span
              v-for="fact in factChips"
              :key="fact.icon"
              class="inline-flex items-center gap-1.5 rounded-full border border-default bg-elevated px-3 py-1 text-xs font-medium text-muted"
            >
              <SayaIcon :name="fact.icon" class="size-3.5" />
              {{ fact.label }}
            </span>
          </div>
        </header>

        <div class="mt-14 grid gap-10 lg:grid-cols-[1fr_380px] lg:items-start">
        <div class="min-w-0">
          <section v-if="product.description" class="border-t border-default pt-10">
            <h2 class="saya-display text-2xl text-default sm:text-3xl">{{ t('saya.experience_detail.what_youll_do') }}</h2>
            <p class="mt-4 whitespace-pre-line text-base leading-relaxed text-muted sm:text-lg">{{ product.description }}</p>
          </section>

          <!-- The next few sessions, on the page: a guest sees when it runs
               before they open anything. The full picker is one press away. -->
          <section v-if="isAvailable && !enquiryOnly" class="mt-10 border-t border-default pt-10">
            <div class="flex flex-wrap items-baseline justify-between gap-4">
              <h2 class="saya-display text-2xl text-default sm:text-3xl">{{ t('saya.experience_detail.upcoming_availability') }}</h2>
              <SayaButton v-if="upcomingSessions.length" variant="ghost" control-id="product-booking-toggle" @click="openBooking">
                {{ t('saya.experience_detail.see_all_dates') }} →
              </SayaButton>
            </div>
            <p v-if="sessionsPending" class="mt-4 text-sm text-muted">{{ t('saya.experience_detail.processing') }}</p>
            <p v-else-if="!upcomingSessions.length" class="mt-4 text-sm text-muted">{{ t('saya.experience_detail.no_availability', { count: PUBLIC_BOOKING_WINDOW_DAYS }) }}</p>
            <ul v-else class="mt-5 grid gap-3 sm:grid-cols-2">
              <li v-for="session in upcomingSessions" :key="session.id" class="flex items-center justify-between gap-4 rounded-xl border border-default bg-elevated px-4 py-3">
                <div class="min-w-0">
                  <p class="font-medium text-default">{{ sessionDayLabel(session) }}</p>
                  <p class="text-sm text-muted">
                    {{ sessionTimeLabel(session) }}
                    <template v-if="session.remaining !== null"> · {{ t('saya.experience_detail.left', { count: session.remaining }) }}</template>
                  </p>
                </div>
                <SayaButton control-id="product-booking-toggle" @click="openBookingAt(session)">
                  {{ t('saya.experience_detail.book') }}
                </SayaButton>
              </li>
            </ul>
          </section>

          <section v-if="includedItems.length || whatToBring.length" class="mt-10 grid gap-8 border-t border-default pt-10 sm:grid-cols-2">
            <div v-if="includedItems.length">
              <h2 class="saya-display text-2xl text-default sm:text-3xl">{{ t('saya.experience_detail.included') }}</h2>
              <ul class="mt-4 space-y-2">
                <li v-for="item in includedItems" :key="item" class="flex items-start gap-2 text-sm leading-6 text-muted">
                  <SayaIcon name="check-circle" class="mt-1 size-4 shrink-0 text-primary" />{{ item }}
                </li>
              </ul>
            </div>
            <div v-if="whatToBring.length">
              <h2 class="saya-display text-2xl text-default sm:text-3xl">{{ t('saya.experience_detail.what_to_bring') }}</h2>
              <ul class="mt-4 space-y-2">
                <li v-for="item in whatToBring" :key="item" class="flex items-start gap-2 text-sm leading-6 text-muted">
                  <SayaIcon name="shopping-bag" class="mt-1 size-4 shrink-0 text-primary" />{{ item }}
                </li>
              </ul>
            </div>
          </section>

          <section class="mt-10 border-t border-default pt-10">
            <h2 class="saya-display text-2xl text-default sm:text-3xl">{{ t('saya.experience_detail.where_youll_meet') }}</h2>
            <div class="mt-5 overflow-hidden rounded-xl border border-default bg-elevated">
              <div class="flex items-start gap-4 p-6">
                <SayaIcon name="map-pin" class="mt-0.5 size-5 shrink-0 text-primary" />
                <div class="min-w-0">
                  <p class="font-semibold text-default">{{ location.title }}</p>
                  <p v-if="addressLine" class="mt-1 text-sm text-muted">{{ addressLine }}</p>
                  <p v-if="location.phone" class="mt-1 text-sm text-muted">{{ location.phone }}</p>
                  <p v-if="meetingPoint" class="mt-3 whitespace-pre-line text-sm leading-6 text-default">{{ meetingPoint }}</p>
                  <a
                    v-if="location.maps_url"
                    :href="location.maps_url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {{ t('saya.experience_detail.open_in_maps') }}
                    <SayaIcon name="arrow-top-right-on-square" class="size-3" />
                  </a>
                </div>
              </div>
              <iframe
                v-if="mapEmbedUrl"
                :src="mapEmbedUrl"
                :title="location.title"
                class="h-56 w-full border-t border-default"
                style="border-width: 1px 0 0"
                loading="lazy"
                referrerpolicy="no-referrer-when-downgrade"
              />
            </div>
          </section>

          <section v-if="thingsToKnow.length" class="mt-10 border-t border-default pt-10">
            <h2 class="saya-display text-2xl text-default sm:text-3xl">{{ t('saya.experience_detail.things_to_know') }}</h2>
            <div class="mt-5 grid gap-x-10 gap-y-6 sm:grid-cols-2">
              <div v-for="detail in thingsToKnow" :key="detail.key">
                <h3 class="text-sm font-semibold text-default">{{ detail.label }}</h3>
                <ul class="mt-2 space-y-1.5">
                  <li v-for="line in detail.values" :key="line" class="text-sm leading-6 text-muted">{{ line }}</li>
                </ul>
              </div>
            </div>
          </section>
        </div>

        <!-- The decision, travelling with the reader: what it costs, when it
             next runs, and the one action. -->
        <div class="hidden lg:sticky lg:top-8 lg:block">
          <div class="space-y-5 rounded-xl border border-default bg-elevated p-6 shadow-sm">
            <div v-if="priceLabel">
              <p class="saya-display text-3xl tabular-nums text-default">
                <span v-if="compareAtLabel" class="mr-2 text-lg text-muted line-through">{{ compareAtLabel }}</span>{{ enquiryOnly ? priceLabel : t('saya.experience_detail.from_price', { price: priceLabel }) }}
              </p>
              <p v-if="!enquiryOnly" class="mt-1 text-sm text-muted">{{ t('saya.experience_detail.per_person') }}</p>
            </div>
            <div v-if="factChips.length" class="flex flex-wrap gap-2">
              <span
                v-for="fact in factChips"
                :key="fact.icon"
                class="inline-flex items-center gap-1.5 rounded-full border border-default bg-default px-3 py-1 text-xs font-medium text-muted"
              >
                <SayaIcon :name="fact.icon" class="size-3.5" />
                {{ fact.label }}
              </span>
            </div>
            <p v-if="nextSession" class="inline-flex items-center gap-2 text-sm text-muted">
              <SayaIcon name="calendar-days" class="size-4" />
              {{ sessionDayLabel(nextSession) }} · {{ sessionTimeLabel(nextSession) }}
            </p>
            <p v-if="!isAvailable" class="rounded-lg bg-default px-4 py-3 text-center text-sm font-semibold text-muted">
              {{ t('saya.common.temporarily_unavailable') }}
            </p>
            <div v-else class="pt-2">
              <SayaButton v-if="enquiryOnly" block :to="enquiryPath">
                {{ t('saya.experience_detail.enquire') }}
              </SayaButton>
              <SayaButton v-else block control-id="product-booking-toggle" @click="openBooking">
                {{ t('saya.experience_detail.book_now') }}
              </SayaButton>
            </div>
          </div>
        </div>
        </div>
      </div>

      <div v-else class="rounded-2xl bg-elevated p-6 sm:p-10 lg:p-12">
        <div :class="product.image?.public_url ? 'grid gap-10 lg:grid-cols-2 items-start' : 'max-w-3xl'">
          <div v-if="product.image?.public_url">
            <img
              :src="product.image.public_url"
              :alt="product.image.alt_text || product.name"
              class="aspect-square w-full rounded-2xl object-cover"
            >
          </div>
          <div class="py-2">
            <p class="saya-kicker">{{ collectionName }}</p>
            <h1 class="saya-display saya-italic mt-3 text-3xl sm:text-4xl lg:text-5xl text-default leading-tight">{{ product.name }}</h1>
            <p class="mt-2 text-sm sm:text-base text-muted">{{ location.title }}</p>
            <div v-if="priceLabel" class="mt-6 flex items-baseline gap-3 text-2xl font-semibold tabular-nums">
              <span v-if="compareAtLabel" class="text-base font-normal text-muted line-through">{{ compareAtLabel }}</span>
              <span>{{ priceLabel }}</span>
            </div>
            <p v-if="product.description" class="mt-6 text-base sm:text-lg leading-relaxed text-muted">{{ product.description }}</p>
            <p v-if="!isAvailable" class="mt-6 font-semibold text-muted">{{ t('saya.common.temporarily_unavailable') }}</p>
            <div class="mt-8 flex flex-wrap items-center gap-5">
              <SayaButton v-if="isAvailable && enquiryOnly" :to="enquiryPath">{{ t('saya.experience_detail.enquire') }}</SayaButton>
              <SayaButton
                v-if="isAvailable && product.order_url"
                :href="product.order_url"
                target="_blank"
                rel="noopener noreferrer"
                @click="recordExternalOrderClick"
              >{{ t('saya.cta.order_now') }}</SayaButton>
              <NuxtLink
                :to="localePath(presentation.collectionPath)"
                class="border-b border-default pb-0.5 text-xs font-bold uppercase tracking-widest text-default no-underline transition hover:opacity-60"
              >
                {{ t('saya.hero.view_menu') }} →
              </NuxtLink>
            </div>
            <dl v-if="visibleDetails.length" class="mt-10 divide-y divide-default border-y border-default">
              <div v-for="detail in visibleDetails" :key="detail.key" class="py-4">
                <dt class="font-medium">{{ detail.label }}</dt>
                <dd class="mt-1 text-sm text-muted">{{ detail.values.join(', ') }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <!-- Siblings in the collection this page was reached through. Derived
           entirely from membership, so every page's body text varies by real
           data and every item in a collection is reachable by internal link. -->
      <section v-if="collectionSiblings.length" class="mt-16 border-t border-default pt-12">
        <h2 class="saya-display saya-italic text-3xl sm:text-4xl">{{ t('saya.product_detail.more_in_category', { category: collectionName }) }}</h2>
        <ul class="mt-6 grid gap-x-10 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="sibling in collectionSiblings" :key="sibling.id">
            <NuxtLink
              :to="localePath(presentation.productPath(location.slug, sibling.slug))"
              class="text-base text-default no-underline transition hover:opacity-60"
            >{{ sibling.name }}</NuxtLink>
          </li>
        </ul>
      </section>

      <!-- The bookable layout already shows every photograph in its gallery;
           this strip is the card layout's only place for them. -->
      <section v-if="!booking && product.gallery.length" class="mt-16">
        <h2 class="saya-display saya-italic text-4xl">{{ t('saya.footer.gallery') }}</h2>
        <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <img
            v-for="asset in product.gallery"
            :key="asset.asset_id"
            :src="asset.public_url"
            :alt="asset.alt_text || product.name"
            class="aspect-square w-full rounded-xl object-cover"
          >
        </div>
      </section>

      <!-- One booking surface, mounted outside the card so the mobile sheet and
           the desktop button open the same thing. -->
      <BookingModal
        v-if="booking"
        v-model="bookingOpen"
        target-id="product-booking"
        :title="product.name"
        :can-go-back="bookingStep > 1 && !submitting"
        @back="bookingStep = 1"
      >
        <div v-if="bookingStep === 1" class="flex min-h-0 flex-1 flex-col">
          <!-- What is being booked. One option is not a choice; several are,
               and the guest makes it rather than the server picking an order. -->
          <fieldset v-if="sellableVariants.length > 1" class="mb-5">
            <legend class="mb-2 text-sm font-medium">{{ t('saya.product_detail.choose_option') }}</legend>
            <div class="flex flex-col gap-2">
              <label
                v-for="variant in sellableVariants"
                :key="variant.id"
                class="flex cursor-pointer items-baseline justify-between gap-3 rounded-lg border border-default px-4 py-3 text-sm"
                :class="selectedVariantId === variant.id ? 'border-primary bg-primary/5' : ''"
              >
                <span class="flex items-baseline gap-3">
                  <input v-model="selectedVariantId" type="radio" :value="variant.id" name="booking-variant">
                  <span>{{ variant.name }}</span>
                </span>
                <span v-if="variantPriceLabel(variant)" class="tabular-nums">{{ variantPriceLabel(variant) }}</span>
              </label>
            </div>
          </fieldset>
          <!-- A guest is choosing a time, so the empty state says what they
               asked: nothing in the window they can book. -->
          <p v-if="!sessionsPending && availabilityDates.length === 0" class="py-10 text-center text-sm text-muted">
            {{ t('saya.experience_detail.no_availability', { count: PUBLIC_BOOKING_WINDOW_DAYS }) }}
          </p>
          <BookingTimeStep
            v-else
            v-model="timeSelection"
            :dates="availabilityDates"
            :loading="sessionsPending"
            :guests="partySize"
            :guests-max="guestsMax"
            @update:guests="partySize = $event"
            @next="bookingStep = 2"
          />
          <p v-if="bookingError" role="alert" class="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-error">
            {{ bookingError }}
          </p>
        </div>

        <div v-else class="flex-1 overflow-y-auto">
          <BookingRecap
            v-if="timeSelection"
            :main-line="timeSelection.label"
            :meta-line="t('saya.experience_detail.guest_count', { count: partySize })"
            :edit-label="t('saya.experience_detail.change')"
            @edit="bookingStep = 1"
          />
          <p v-if="bookingError" role="alert" class="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-error">
            {{ bookingError }}
          </p>
          <BookingContactForm
            :loading="submitting"
            :submit-text="t('saya.experience_detail.confirm_booking')"
            @submit="submitBooking"
          />
        </div>
      </BookingModal>

      <section v-if="reviews.length" class="mt-16 border-t border-default pt-12">
        <div class="flex flex-wrap items-baseline gap-3">
          <h2 class="saya-display saya-italic text-3xl sm:text-4xl">{{ t('saya.footer.reviews') }}</h2>
          <span v-if="averageRating" class="inline-flex items-center gap-1 text-sm text-muted">
            <SayaIcon name="star" solid class="size-4 text-default" />{{ averageRating }} · {{ reviewCountLabel }}
          </span>
        </div>
        <p v-if="reviews.some(review => review.source === 'google_places')" class="mt-4 text-xs text-muted">{{ t('saya.reviews.google_order_notice') }}</p>
        <div class="mt-6 grid gap-6 sm:grid-cols-2">
          <SayaReviewCard v-for="review in reviewCards" :key="review.id" variant="compact" :review="review" />
        </div>
      </section>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { Product, ProductPresentation } from '~/server/types/products'
import { useSchemaOrg } from '~/composables/useSchemaOrg'
import type { CurrencyCode } from '~/shared/currencies'
import { minorAmountToMajor, selectPrice, type Price } from '~/shared/prices'
import { formatProductMoney } from '~/utils/product-money'
import { productLocationCollectionPath } from '~/utils/product-presentation'
import type { ProductCollectionSibling } from '~/utils/product-seo'
import type { MetafieldDefinition, MetafieldValue } from '~/shared/metafields'
import { metafieldHandle, PRICING_NOTE_HANDLE } from '~/shared/metafields'
import type { PublicProductBooking, PublicProductLocationPayload, PublicProductReview } from '~/server/utils/public-products'
import { formatLocationAddress } from '~/utils/location-address'
import SayaReviewCard from '~/components/saya/SayaReviewCard.vue'
import BookingModal from '~/components/booking/BookingModal.vue'
import BookingRecap from '~/components/booking/BookingRecap.vue'
import BookingContactForm, { type ContactFormState } from '~/components/booking/BookingContactForm.vue'
import BookingTimeStep, { type RawDateAvailability, type TimeSlotSelection } from '~/components/booking/BookingTimeStep.vue'
import { setBookingConfirmation } from '~/composables/useBookingHandoff'
import { localPartsAt } from '~/utils/timezone'
import { PUBLIC_BOOKING_WINDOW_DAYS } from '~/shared/bookings'
import { getErrorMessage } from '~/utils/errors'

const props = defineProps<{
  siteId: string
  vertical: string
  product: Product
  location: PublicProductLocationPayload
  reviews: PublicProductReview[]
  /** Non-null exactly when this Product takes bookings. */
  booking: PublicProductBooking | null
  collectionName: string
  collectionSiblings: ProductCollectionSibling[]
  /** The tenant's attribute vocabulary, so this page can label its own facts. */
  metafieldDefinitions: MetafieldDefinition[]
  currency: CurrencyCode
  presentation: ProductPresentation
  analyticsEnabled?: boolean
}>()

const { trackProductOrder } = useSiteConversionTracking()
const { locale, localePath, t } = useI18n()
const collectionLabel = computed(() => {
  if (props.presentation.locationCollectionSegment === 'menu') return t('saya.footer.menu')
  return props.presentation.locationCollectionSegment === 'experiences'
    ? t('saya.footer.experiences')
    : t('saya.footer.products')
})
const breadcrumbs = computed(() => [
  { to: localePath('/'), label: t('saya.experience_detail.home') },
  { to: localePath(props.presentation.collectionPath), label: collectionLabel.value },
  { to: localePath(props.presentation.locationCollectionSegment === 'experiences'
    ? `/locations/${encodeURIComponent(props.location.slug)}/experiences`
    : productLocationCollectionPath(props.vertical, props.location.slug)), label: props.location.title },
  { to: localePath(props.presentation.productPath(props.location.slug, props.product.slug)), label: props.product.name },
])

/**
 * The offer this page quotes, resolved once through the one selection
 * contract. A product with several variants shows its lowest applicable offer;
 * each variant's own price is on this page under its option.
 */
const offer = computed<Price | null>(() => {
  const selection = { currency: props.currency, location_id: props.location.id, at: new Date().toISOString() }
  // Only variants a customer can actually choose: a disabled variant's price
  // would otherwise headline an amount the selector never offers.
  const offers = sellableVariants.value.flatMap(variant => selectPrice(variant.prices, selection) ?? [])
  return offers.reduce<Price | null>((lowest, candidate) => (!lowest || candidate.unit_amount < lowest.unit_amount ? candidate : lowest), null)
})
/**
 * The amount, or the merchant's own words when the product is priced in words
 * instead. Neither one means this page shows no price — never a zero, a
 * "Free", or a "Market price" nobody wrote.
 */
const priceLabel = computed(() => {
  const amount = formatProductMoney(offer.value)
  if (amount) return amount
  const note = props.product.metafields[PRICING_NOTE_HANDLE]
  return typeof note === 'string' && note.trim() ? note : null
})
/**
 * A product priced in words is sold by conversation: "Contact us for group
 * pricing" is the merchant asking to be asked, not a seat to be claimed at a
 * price. Its one action is the contact form, with the product named — the
 * rule the old experience surface called inquiry_only.
 */
const enquiryOnly = computed(() => offer.value === null && priceLabel.value !== null)
const enquiryPath = computed(() => `${localePath('/contact')}?about=${encodeURIComponent(props.product.name)}`)

const compareAtLabel = computed(() => {
  const price = offer.value
  if (!price || price.compare_at_unit_amount === null) return null
  return formatProductMoney({ ...price, unit_amount: price.compare_at_unit_amount, compare_at_unit_amount: null })
})

/**
 * Whether this branch is selling it at all: the merchant's switch and this
 * location's. Two facts, neither substituting for the other.
 *
 * A price is not one of them. A product priced in words — "Market price" — is
 * on sale; it just cannot be checked out online, which is a different question
 * asked below.
 */
/** The options a customer can actually choose. A retired variant is not one. */
const sellableVariants = computed(() => props.product.variants.filter(variant => variant.active !== false))

const isAvailable = computed(() =>
  props.product.active
  && props.product.locations.some(entry => entry.location_id === props.location.id && entry.active)
  // Every option retired is the merchant having nothing left to sell here. The
  // booking form otherwise asked for an option it had none to offer.
  && sellableVariants.value.length > 0)



/**
 * Every photograph this product has, cover first, in one gallery.
 *
 * The cover is the `product:image` placement and the rest are `product:gallery`
 * — two slots, read as the two things they are, not one list with a chosen
 * head.
 */
const galleryItems = computed(() => [
  ...(props.product.image ? [props.product.image] : []),
  ...props.product.gallery,
].map(asset => ({
  url: asset.public_url,
  kind: asset.kind,
  poster: asset.kind === 'video' ? asset.thumbnail_url : undefined,
  alt: asset.alt_text ?? undefined,
})))

/**
 * The two facts a guest decides on before opening the form: how long it runs
 * and how many it takes. Both come from the product's booking configuration,
 * which is also what its sessions are generated from, so the page and the
 * calendar cannot disagree.
 */
const factChips = computed(() => {
  const config = props.product.booking
  if (!config) return []
  const chips: Array<{ icon: 'clock' | 'user-group'; label: string }> = []
  if (config.duration_minutes) {
    const minutes = config.duration_minutes
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    chips.push({
      icon: 'clock',
      label: minutes < 60
        ? t('saya.experience_detail.minutes', { count: minutes })
        : rest
          ? t('saya.experience_detail.hours_minutes', { hours, minutes: rest })
          : t('saya.experience_detail.hours', { count: hours }),
    })
  }
  if (config.default_capacity) {
    chips.push({ icon: 'user-group', label: t('saya.experience_detail.capacity', { count: config.default_capacity }) })
  }
  return chips
})

/**
 * The labelled facts under the product, named by the tenant's own definitions.
 * An attribute with no definition is not rendered under a raw key.
 */
const visibleDetails = computed(() => props.metafieldDefinitions.flatMap((definition) => {
  const handle = metafieldHandle(definition)
  // The pricing note is shown where the price goes, so it is not repeated in
  // the attribute list underneath it.
  if (handle === PRICING_NOTE_HANDLE) return []
  const value = props.product.metafields[handle]
  if (value === undefined || value === null) return []
  const values = Array.isArray(value) ? value : [String(value)]
  return values.length ? [{ key: definition.id, label: definition.name, values }] : []
}))

/**
 * The sessions a guest can claim a seat on.
 *
 * Materialized occurrences only. A bookable Product whose sessions have not
 * been generated offers nothing rather than a schedule computed on the fly
 * that no row backs.
 */
interface PublicSession {
  id: string
  starts_at: string
  ends_at: string
  timezone: string
  remaining: number | null
  is_full: boolean
}

const bookingOpen = ref(false)
const bookingStep = ref(1)
const partySize = ref(1)
/** The options a customer can actually choose — what is priced, and what is booked. */
const selectedVariantId = ref<string | null>(sellableVariants.value.length === 1 ? sellableVariants.value[0]!.id : null)
function variantPriceLabel(variant: Product['variants'][number]) {
  return formatProductMoney(selectPrice(variant.prices, { currency: props.currency, location_id: props.location.id, at: new Date().toISOString() }))
}
const timeSelection = ref<TimeSlotSelection | null>(null)
const submitting = ref(false)
const bookingError = ref('')
const sessions = ref<PublicSession[]>([])
const sessionsPending = ref(false)

function localDateOf(session: PublicSession) {
  const parts = localPartsAt(new Date(session.starts_at), session.timezone)
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}
function localTimeOf(session: PublicSession) {
  const parts = localPartsAt(new Date(session.starts_at), session.timezone)
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
}

// The calendar speaks in the session's own zone, so a 10:00 class is 10:00 for
// every guest reading the page from anywhere.
const availabilityDates = computed<RawDateAvailability[]>(() => {
  const byDate = new Map<string, RawDateAvailability>()
  for (const session of sessions.value) {
    const date = localDateOf(session)
    const entry = byDate.get(date) ?? { date, slots: [] }
    entry.slots.push({
      time_slot: localTimeOf(session),
      capacity: session.remaining === null ? null : session.remaining,
      booked: 0,
      remaining: session.remaining,
      is_closed: false,
      is_full: session.is_full,
    })
    byDate.set(date, entry)
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date))
})

/**
 * The largest party the calendar can take.
 *
 * Seats live on the session, not on the product: `default_capacity` is what
 * generating an occurrence starts from, and the sessions already on the
 * calendar keep whatever capacity they were given. Reading the product default
 * here capped a twelve-seat session at four, and a product with no default at
 * an unrelated eight.
 *
 * Once a time is chosen it is that session's remaining seats; before then it is
 * the most any session on the calendar has left. A session with no capacity at
 * all takes any party the endpoint accepts.
 */
const MAX_PARTY_SIZE = 99
const guestsMax = computed(() => {
  const pool = selectedSession.value ? [selectedSession.value] : sessions.value
  if (!pool.length) return 1
  if (pool.some(session => session.remaining === null)) return MAX_PARTY_SIZE
  return Math.max(1, ...pool.map(session => session.remaining ?? 0))
})

const selectedSession = computed<PublicSession | null>(() => {
  const selection = timeSelection.value
  if (!selection) return null
  return sessions.value.find(session => localDateOf(session) === selection.day && localTimeOf(session) === selection.time) ?? null
})

/**
 * Load what the form needs. Opening is the checkbox's job.
 *
 * The control is a label for the modal's checkbox, so pressing it toggles that
 * checkbox and the modal reports the new state back through v-model. Setting
 * `bookingOpen` here as well raced the label's own activation: the state said
 * open, the checkbox had been flipped back, and the dialog stayed hidden with
 * its sessions loaded behind it.
 */
/** The occurrences a guest can choose from, fetched once for the page and the form alike. */
async function loadSessions() {
  if (sessions.value.length || sessionsPending.value) return
  sessionsPending.value = true
  try {
    const response = await publicApiRequest<{ success: true; sessions: PublicSession[] }>(
      // This page is one branch's page, so it asks for that branch's
      // occurrences. Two branches running the same class at the same hour
      // would otherwise be indistinguishable by date and time alone.
      `/api/public/sites/${encodeURIComponent(props.siteId)}/products/${encodeURIComponent(props.product.slug)}/sessions?location_id=${encodeURIComponent(props.location.id)}`,
      {
        validate: (value): value is { success: true; sessions: PublicSession[] } =>
          isRecord(value) && value.success === true && Array.isArray(value.sessions),
      },
    )
    sessions.value = response.sessions.filter(session => !session.is_full)
  } catch (error) {
    bookingError.value = getErrorMessage(error, t('saya.experience_detail.no_availability', { count: PUBLIC_BOOKING_WINDOW_DAYS }))
  } finally {
    sessionsPending.value = false
  }
}

async function openBooking() {
  bookingStep.value = 1
  bookingError.value = ''
  await loadSessions()
}

/** A guest pressing a time on the page arrives in the form with it chosen. */
async function openBookingAt(session: PublicSession) {
  timeSelection.value = { day: localDateOf(session), time: localTimeOf(session), label: sessionDayLabel(session) }
  await openBooking()
}

// The page shows the next sessions itself, so they are loaded with it — only
// for a product a guest can book here; an enquiry has no calendar.
onMounted(() => {
  if (props.booking && isAvailable.value && !enquiryOnly.value) void loadSessions()
})

const upcomingSessions = computed(() => {
  const now = Date.now()
  return sessions.value
    .filter(session => Date.parse(session.starts_at) > now)
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
    .slice(0, 4)
})
const nextSession = computed(() => upcomingSessions.value[0] ?? null)

function sessionDayLabel(session: PublicSession): string {
  return new Intl.DateTimeFormat(locale.value, { weekday: 'short', day: 'numeric', month: 'short', timeZone: session.timezone }).format(new Date(session.starts_at))
}
function sessionTimeLabel(session: PublicSession): string {
  const format = new Intl.DateTimeFormat(locale.value, { hour: 'numeric', minute: '2-digit', timeZone: session.timezone })
  return `${format.format(new Date(session.starts_at))} – ${format.format(new Date(session.ends_at))}`
}
const { formatDate } = useLocaleDate()

const reviewCards = computed(() => props.reviews.map(review => ({
  id: review.id,
  author: review.author,
  rating: review.rating,
  content: review.content,
  title: review.title,
  dateLabel: formatDate(review.createdAt),
  source: review.source,
  original_reference: review.original_reference,
  google_review_metadata: review.google_review_metadata,
})))

/** What guests say, in one number: the mean rating to one decimal, or none. */
const averageRating = computed(() => {
  if (!props.reviews.length) return null
  return (props.reviews.reduce((total, review) => total + review.rating, 0) / props.reviews.length).toFixed(1)
})
const reviewCountLabel = computed(() => (props.reviews.length === 1
  ? t('saya.experience_detail.review_count_one')
  : t('saya.experience_detail.review_count', { count: props.reviews.length })))

/**
 * The attributes the page gives their own place, found by the definition's
 * key: the tenant names them, the page knows what a tagline, a list of what is
 * included, what to bring and a meeting point are for. Everything else the
 * tenant defined is "things to know".
 */
function attributeByKey<T>(key: string, read: (_value: MetafieldValue) => T | null): T | null {
  const definition = props.metafieldDefinitions.find(entry => entry.key === key)
  if (!definition) return null
  const value = props.product.metafields[metafieldHandle(definition)]
  return value === undefined || value === null ? null : read(value)
}
const asText = (value: MetafieldValue) => (typeof value === 'string' && value.trim() ? value : null)
const asList = (value: MetafieldValue) => (Array.isArray(value) ? value.map(String).filter(Boolean) : null)
const tagline = computed(() => attributeByKey('tagline', asText))
const meetingPoint = computed(() => attributeByKey('meeting_point', asText))
const includedItems = computed(() => attributeByKey('included_items', asList) ?? [])
const whatToBring = computed(() => attributeByKey('what_to_bring', asList) ?? [])
const PLACED_ATTRIBUTE_KEYS = new Set(['tagline', 'meeting_point', 'included_items', 'what_to_bring'])
const thingsToKnow = computed(() => visibleDetails.value.filter((detail) => {
  const definition = props.metafieldDefinitions.find(entry => entry.id === detail.key)
  return !definition || !PLACED_ATTRIBUTE_KEYS.has(definition.key)
}))

const addressLine = computed(() => formatLocationAddress(props.location.address))
// A map from the coordinates the branch already has; no key, no second source.
const mapEmbedUrl = computed(() => (props.location.latitude !== null && props.location.longitude !== null
  ? `https://www.google.com/maps?q=${props.location.latitude},${props.location.longitude}&output=embed`
  : null))

async function submitBooking(contact: ContactFormState) {
  const session = selectedSession.value
  if (submitting.value) return
  if (!session) {
    bookingError.value = t('saya.experience_detail.choose_time')
    bookingStep.value = 1
    return
  }
  if (!selectedVariantId.value) {
    bookingError.value = t('saya.product_detail.choose_option')
    bookingStep.value = 1
    return
  }
  submitting.value = true
  bookingError.value = ''
  try {
    const response = await publicApiMutation<{ success: true; booking_id: string; cancellation_token: string; message: string; policy_summary?: ApiRecord | null }>(
      `/api/public/sites/${encodeURIComponent(props.siteId)}/products/${encodeURIComponent(props.product.slug)}/book`,
      {
        method: 'POST',
        body: {
          session_id: session.id,
          variant_id: selectedVariantId.value,
          party_size: partySize.value,
          guest_name: contact.name,
          guest_email: contact.email,
          guest_phone: contact.phone || null,
          notes: contact.notes || null,
          locale: locale.value,
        },
        validate: (value): value is { success: true; booking_id: string; cancellation_token: string; message: string } =>
          isRecord(value) && value.success === true && typeof value.booking_id === 'string' && typeof value.cancellation_token === 'string',
      },
    )
    setBookingConfirmation({
      type: 'booking',
      siteId: props.siteId,
      siteName: props.location.title,
      guestName: contact.name,
      startsAt: session.starts_at,
      timezone: session.timezone,
      guests: partySize.value,
      productId: props.product.id,
      title: props.product.name,
      requests: contact.notes || null,
      message: response.message,
      cancelUrl: `/bookings/cancel?id=${response.booking_id}#${response.cancellation_token}`,
      policySummary: response.policy_summary ?? null,
      locationId: props.location.id,
      locationName: props.location.title,
      locationSlug: props.location.slug,
    })
    bookingOpen.value = false
    await navigateTo('/bookings/confirmed')
  } catch (error) {
    bookingError.value = getErrorMessage(error, 'That booking could not be completed. Please try again.')
  } finally {
    submitting.value = false
  }
}

function recordExternalOrderClick() {
  if (!import.meta.client || props.analyticsEnabled === false) return
  trackProductOrder(
    props.location.id,
    props.product.id,
    props.presentation.productPath(props.location.slug, props.product.slug),
  )
}

useSchemaOrg(computed(() => ({
  '@type': props.presentation.structuredDataType,
  name: props.product.name,
  description: props.product.description,
  image: props.product.image?.public_url,
  // An offer node states an amount, so a product priced in words has none to
  // state. It is still on sale; it simply is not quoted here.
  offers: offer.value
    ? {
        '@type': 'Offer',
        price: minorAmountToMajor(offer.value.unit_amount, offer.value.currency),
        priceCurrency: offer.value.currency,
        availability: isAvailable.value ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: props.product.order_url || localePath(props.presentation.productPath(props.location.slug, props.product.slug)),
      }
    : undefined,
  aggregateRating: props.reviews.length
    ? {
        '@type': 'AggregateRating',
        ratingValue: props.reviews.reduce((total, review) => total + review.rating, 0) / props.reviews.length,
        reviewCount: props.reviews.length,
      }
    : undefined,
  review: props.reviews.map(review => ({
    '@type': 'Review',
    author: { '@type': 'Person', name: review.author },
    name: review.title,
    reviewBody: review.content,
    reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5 },
  })),
})))
</script>
