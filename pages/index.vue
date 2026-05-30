<template>
  <NuxtLayout :name="isPlatform ? 'platform' : 'saya'">
    <!-- KrabiClaw Platform Homepage -->
    <div v-if="isPlatform" class="bg-default">

      <!-- Hero -->
      <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 grid lg:grid-cols-2 gap-12 items-center">
        <div class="flex flex-col gap-6">
          <!-- Eyebrow -->
          <span class="self-start inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.3em] uppercase text-(--kc-teal-600) bg-(--kc-teal-100) px-3.5 py-1.5 rounded-full">
            <span class="w-1.5 h-1.5 rounded-full bg-(--kc-teal) shrink-0" />
            New · AI content translator
          </span>

          <!-- Headline -->
          <h1 class="text-[clamp(40px,5vw,64px)] font-extrabold leading-[1.02] tracking-tight text-default text-balance m-0">
            Build, grow, and manage your <span class="text-(--kc-coral)">business</span> online.
          </h1>

          <p class="text-lg leading-relaxed text-muted m-0 max-w-lg">
            The Shopify for local businesses. Beautiful sites, AI-powered content, Google Business sync — in one tidy little dashboard.
          </p>

          <!-- CTAs -->
          <div class="flex flex-wrap gap-3">
            <NuxtLink
              to="/signup"
              class="inline-flex items-center gap-2 bg-(--kc-coral) text-white font-semibold text-[15px] px-6 py-3.5 rounded-[10px] hover:opacity-90 transition-opacity no-underline"
            >
              Start free
              <UIcon name="i-heroicons-arrow-right" class="size-4" />
            </NuxtLink>
            <NuxtLink
              to="/templates"
              class="inline-flex items-center bg-transparent text-(--kc-teal-600) border border-(--kc-teal) font-semibold text-[15px] px-6 py-3.5 rounded-full hover:bg-(--kc-teal-100) transition-colors no-underline"
            >
              See live demo
            </NuxtLink>
          </div>

          <!-- Social proof -->
          <div class="flex items-center gap-3 mt-2">
            <div class="flex">
              <div
                v-for="(av, i) in avatars"
                :key="i"
                class="w-8 h-8 rounded-full border-2 border-default flex items-center justify-center text-white text-xs font-bold -ml-2 first:ml-0"
                :style="{ background: av.color }"
              >{{ av.letter }}</div>
            </div>
            <p class="text-[13px] text-muted m-0">
              Trusted by <strong class="text-default">1,200+ businesses</strong> across SE Asia
            </p>
          </div>
        </div>

        <!-- Mascot / hero visual -->
        <div class="hidden lg:flex justify-center">
          <div class="bg-(--kc-coral-50) rounded-3xl p-7 shadow-xl max-w-lg w-full">
            <img
              src="/krabiclaw-login-mascot.png"
              alt="KrabiClaw mascot"
              class="w-full block rounded-[20px]"
            >
          </div>
        </div>
      </section>

      <!-- Features -->
      <section id="features" class="bg-elevated border-y border-default py-20">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center max-w-2xl mx-auto mb-12 flex flex-col items-center gap-4">
            <span class="kc-eyebrow text-muted">Everything your business needs</span>
            <h2 class="text-[44px] font-extrabold tracking-tight leading-[1.05] text-default m-0">One platform. No plugins. No fuss.</h2>
          </div>
          <div class="grid md:grid-cols-3 gap-5">
            <div
              v-for="feat in features"
              :key="feat.title"
              class="rounded-[18px] p-7 border border-default"
              :class="feat.dark
                ? 'bg-(--kc-navy)'
                : feat.muted
                  ? 'bg-stone-50 dark:bg-stone-800/60 shadow-none'
                  : 'bg-white dark:bg-(--kc-navy-700) shadow-[0_1px_3px_rgba(31,37,71,0.04)]'"
            >
              <div
                class="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                :class="feat.dark ? 'bg-(--kc-coral)' : 'bg-(--kc-navy) dark:bg-(--kc-navy-500)'"
              >
                <UIcon :name="feat.icon" class="size-5 text-white" />
              </div>
              <h3 class="text-lg font-bold mb-2 m-0"
                :class="feat.dark
                  ? 'text-white'
                  : 'text-default'"
              >{{ feat.title }}</h3>
              <p class="text-[14px] leading-relaxed m-0"
                :class="feat.dark
                  ? 'text-white/75'
                  : 'text-muted'"
              >{{ feat.body }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Pricing -->
      <section class="bg-default py-20">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center max-w-2xl mx-auto mb-12 flex flex-col items-center gap-4">
            <span class="kc-eyebrow text-dimmed">Simple pricing</span>
            <h2 class="text-[44px] font-extrabold tracking-tight leading-[1.05] text-default m-0">Start free. Grow when you're ready.</h2>
          </div>
          <LazyBillingPricingTable />
        </div>
      </section>
    </div>

    <!-- Saya Restaurant Theme (Tenant Site) -->
    <div v-else class="saya-restaurant-theme">

      <!-- ── Brand hero ─────────────────────────────────────── -->
      <SayaHomeHero
        v-if="contentBlocks.find(b => b.component === 'SayaHomeHero')"
        :data="{
          hero: getHero(),
          locations: bootstrapLocations,
          businessTitle: googleBusiness?.title,
          businessSubtitle: googleBusiness?.profile?.description,
          businessCity: googleBusiness?.storefrontAddress?.locality,
          businessPrimaryPhoto: googleBusiness?.media?.[0],
          hasOrderLinks: hasOrderLinks,
          ctaRoute: homeCopy.ctaRoute,
          reserveCta: homeCopy.reserveCta
        }"
      />
      <section v-else id="section-hero" class="relative min-h-160 overflow-hidden flex items-center">
        <!-- Background video (takes precedence over photo) -->
        <div v-if="hero.video && hero.videoKind === 'video'" data-field="hero.video" class="absolute inset-0">
          <video :src="hero.video" autoplay muted loop playsinline aria-hidden="true" role="presentation" class="w-full h-full object-cover opacity-50" />
        </div>
        <!-- Background photo: media asset takes precedence, then Google Business photo -->
        <div
          v-else-if="(hero.image && hero.imageKind === 'image') || businessPrimaryPhoto"
          data-field="hero.image"
          class="absolute inset-0 bg-cover bg-center opacity-50"
          :style="`background-image: url(${hero.image || businessPrimaryPhoto?.googleUrl})`"
        />
        <!-- Fallback if hero.image is actually a video -->
        <div v-else-if="hero.image && hero.imageKind === 'video'" class="absolute inset-0">
          <video :src="hero.image" autoplay muted loop playsinline aria-hidden="true" role="presentation" class="w-full h-full object-cover opacity-50" />
        </div>

        <div class="absolute inset-0 bg-zinc-950" :class="(hero.image || businessPrimaryPhoto || hero.video) ? 'opacity-50' : ''" />
        <div class="relative mx-auto w-full max-w-7xl px-4 py-36 sm:px-6 lg:px-8">
          <p v-if="getField('hero.eyebrow', businessCity)" data-field="hero.eyebrow" class="saya-eyebrow mb-8 text-white/70">
            {{ getField('hero.eyebrow', businessCity) }}
          </p>
          <h1 data-field="hero.title" class="saya-display-lg text-white max-w-4xl">
            {{ hero.title || businessTitle }}<br>
            <em v-if="hero.subtitle" data-field="hero.subtitle" class="saya-italic">{{ hero.subtitle }}</em>
            <em v-else-if="businessSubtitle" data-field="hero.subtitle" class="saya-italic">{{ businessSubtitle }}</em>
          </h1>

          <!-- Location pills -->
          <div v-if="hasLocations" class="mt-12 flex flex-wrap gap-3">
            <NuxtLink
              v-for="loc in locations"
              :key="loc.id"
              :to="`/locations/${loc.slug}`"
              class="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/5 px-5 py-2.5 text-sm text-white backdrop-blur-sm no-underline transition hover:bg-white/10"
            >
              <UIcon name="i-heroicons-map-pin" class="size-3.5 opacity-70" />
              {{ loc.title }}
            </NuxtLink>
          </div>
          <div v-else class="mt-12 flex flex-wrap gap-4">
            <UButton v-if="hasOrderLinks" to="/order" color="neutral" variant="solid" size="xl" class="rounded-full bg-white! text-black! hover:bg-zinc-100!">Order Now</UButton>
            <UButton
              :to="homeCopy.ctaRoute"
              color="neutral"
              :variant="hasOrderLinks ? 'outline' : 'solid'"
              size="xl"
              class="rounded-full"
              :class="hasOrderLinks ? 'border-white/50 text-white hover:bg-white/10' : 'bg-white! text-black! hover:bg-zinc-100!'"
            >
              {{ homeCopy.reserveCta }}
            </UButton>
            <UButton
              v-if="!hasOrderLinks"
              to="/menu"
              color="neutral"
              variant="outline"
              size="xl"
              class="rounded-full border-white/50 text-white hover:bg-white/10"
            >
              View Menu
            </UButton>
          </div>
        </div>
      </section>

      <!-- ── Featured content (dishes / experiences) ─────────── -->
      <LazySayaFeaturedContent
        v-if="contentBlocks.find(b => b.component === 'SayaFeaturedContent')"
        :data="{
          items: featuredContent,
          hasMenu: hasMenu
        }"
      />
      <section v-else-if="featuredContent.length" class="mx-auto max-w-7xl px-4 pt-16 pb-8 sm:px-6 lg:px-8">
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NuxtLink
            v-for="(item, i) in featuredContent"
            :key="i"
            :to="item.href"
            class="group block overflow-hidden bg-elevated no-underline text-default transition hover:opacity-90"
          >
            <div class="aspect-square overflow-hidden bg-muted">
              <video
                v-if="item.imageKind === 'video' && item.image"
                :src="item.image"
                autoplay
                muted
                loop
                playsinline
                class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <img
                v-else-if="item.image"
                :src="item.image"
                :alt="item.alt"
                class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              >
              <div v-else class="flex h-full w-full items-center justify-center">
                <UIcon name="i-heroicons-sparkles" class="size-8 text-muted" />
              </div>
            </div>
            <div class="p-3 pt-2">
              <p class="saya-display saya-italic text-base text-default leading-snug line-clamp-2">{{ item.name }}</p>
              <p v-if="item.price" class="mt-0.5 text-xs tabular-nums text-muted">{{ item.price }}</p>
            </div>
          </NuxtLink>
        </div>
      </section>

      <!-- ── Locations grid ─────────────────────────────────── -->
      <LazySayaLocationsGrid
        v-if="contentBlocks.find(b => b.component === 'SayaLocationsGrid')"
        :data="{
          locations: locations,
          heading: homeCopy.locationGroupLine(locations.length),
          isAuthenticated: isAuthenticated
        }"
      />
      <section v-else class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div class="mb-16 max-w-2xl">
          <p class="saya-kicker mb-6">Find us</p>
          <h2 class="saya-display-md text-default">
            {{ homeCopy.locationGroupLine(locations.length) }}
          </h2>
        </div>
        <!-- Real locations -->
        <div v-if="hasLocations" :class="['grid gap-8', locations.length > 1 ? 'md:grid-cols-2' : '']">
          <NuxtLink
            v-for="loc in locations"
            :key="loc.id"
            :to="`/locations/${loc.slug}`"
            class="group block overflow-hidden border border-default text-default no-underline transition hover:border-muted"
          >
            <div class="aspect-video overflow-hidden bg-muted">
              <!-- Homepage card always shows a static image — video plays on the location page.
                   For video locations use hero_video_thumbnail_url (extracted WebP first-frame). -->
              <img
                v-if="loc.hero_video_thumbnail_url || loc.public_url"
                :src="loc.hero_video_thumbnail_url || (loc.kind !== 'video' ? loc.public_url : null)"
                :alt="loc.title"
                loading="lazy"
                class="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-105"
              >
              <div v-else class="flex h-full w-full items-center justify-center">
                <UIcon name="i-heroicons-map-pin" class="size-10 text-muted" />
              </div>
            </div>
            <div class="p-8 pb-9">
              <div v-if="loc.city" class="saya-eyebrow mb-5 flex items-center gap-2 text-muted">
                <span class="size-1.5 rounded-full bg-zinc-300" />
                {{ loc.city }}
              </div>
              <div class="saya-display saya-italic text-4xl text-default leading-none">{{ loc.title }}</div>
              <div class="mt-6 border-t border-default pt-5">
                <span class="saya-eyebrow text-muted">Visit this location →</span>
              </div>
            </div>
          </NuxtLink>
        </div>

        <!-- Empty state: no locations yet -->
        <div v-else class="grid gap-8 md:grid-cols-2">
          <div
            v-for="i in 2"
            :key="i"
            class="overflow-hidden border border-dashed border-default"
          >
            <div class="flex aspect-video items-center justify-center bg-muted">
              <UIcon name="i-heroicons-map-pin" class="size-10 text-muted" />
            </div>
            <div class="p-8 pb-9">
              <div class="saya-display saya-italic text-4xl text-muted leading-none">
                {{ i === 1 ? 'Main location' : 'Second location' }}
              </div>
              <p class="mt-4 text-sm text-muted">
                {{ i === 1 ? 'Connect Google Business to sync your address, hours, photos and reviews.' : 'Add a second location once your first is connected.' }}
              </p>
            </div>
          </div>
          <div v-if="isAuthenticated" class="md:col-span-2 text-center pt-2">
            <UButton to="/dashboard" color="neutral" variant="outline" size="sm" class="rounded-full">
              Connect Google Business →
            </UButton>
          </div>
        </div>
      </section>

      <!-- ── Posts / Lately ────────────────────────────────── -->
      <section v-if="recentPosts.length" class="bg-elevated">
        <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div class="mb-16 max-w-2xl">
            <p class="saya-kicker mb-6">Lately</p>
            <h2 class="saya-display-md text-default">{{ homeCopy.highlightsSectionHeading }}</h2>
          </div>
          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <UModal
              v-for="post in recentPosts"
              :key="post.id"
              :ui="{ content: 'max-w-2xl' }"
            >
              <!-- Trigger tile -->
              <article
                class="group cursor-pointer overflow-hidden bg-default text-default transition hover:opacity-90"
                :class="post.wide ? 'sm:col-span-2' : ''"
              >
                <div v-if="post.image" class="overflow-hidden bg-muted" :class="post.wide ? 'aspect-video' : 'aspect-square'">
                  <video
                    v-if="post.imageKind === 'video'"
                    :src="post.image"
                    autoplay
                    muted
                    loop
                    playsinline
                    class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <img
                    v-else
                    :src="post.image"
                    :alt="post.alt"
                    class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  >
                </div>
                <div class="p-5 pt-4">
                  <p class="saya-eyebrow mb-2 text-muted">{{ homeCopy.postsEyebrow }}</p>
                  <p class="text-sm leading-relaxed text-default line-clamp-3">{{ post.text }}</p>
                  <p class="mt-3 saya-eyebrow text-muted opacity-60">Read more →</p>
                </div>
              </article>

              <!-- Modal: full post -->
              <template #body>
                <div v-if="post.image" class="-mx-6 -mt-6 mb-6 overflow-hidden bg-muted">
                  <video
                    v-if="post.imageKind === 'video'"
                    :src="post.image"
                    autoplay
                    muted
                    loop
                    playsinline
                    class="w-full aspect-video object-cover"
                  />
                  <img
                    v-else
                    :src="post.image"
                    :alt="post.alt"
                    class="w-full aspect-video object-cover"
                  >
                </div>
                <p class="saya-eyebrow mb-4 text-muted">{{ homeCopy.postsEyebrow }}</p>
                <p class="text-base leading-relaxed text-default whitespace-pre-line">{{ post.text }}</p>
              </template>
            </UModal>
          </div>
        </div>
      </section>

      <!-- ── Brand story ─────────────────────────────────────── -->
      <LazySayaBrandStory
        v-if="contentBlocks.find(b => b.component === 'SayaBrandStory')"
        :data="{
          headline: getField('story.headline', businessTitle),
          body: getField('story.body', businessSubtitle),
          image: getField('story.image'),
          isAuthenticated: isAuthenticated
        }"
      />
      <section v-else class="bg-inverted text-inverted">
        <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">

          <!-- Filled state -->
          <template v-if="getField('story.headline') || hasGoogleBusiness">
            <div :class="getField('story.image') ? 'grid gap-16 lg:grid-cols-2 lg:items-center' : ''">
              <div>
                <p class="saya-eyebrow mb-8 text-inverted/60">Our story</p>
                <h2 class="saya-display-md text-inverted" :class="getField('story.image') ? '' : 'max-w-3xl'">
                  {{ getField('story.headline', businessTitle) }}
                </h2>
                <p class="mt-8 text-base leading-relaxed text-inverted/60" :class="getField('story.image') ? '' : 'max-w-2xl'">
                  {{ getField('story.body', businessSubtitle) }}
                </p>
                <NuxtLink
                  to="/about"
                  class="mt-8 inline-block border-b border-inverted pb-1 text-xs uppercase tracking-widest text-inverted no-underline transition hover:opacity-60"
                >
                  Read more →
                </NuxtLink>
              </div>
              <div v-if="getField('story.image')" class="overflow-hidden">
                <img
                  :src="getField('story.image')"
                  alt=""
                  aria-hidden="true"
                  class="h-full w-full object-cover aspect-4/3"
                >
              </div>
            </div>
          </template>

          <!-- Empty state: owner hasn't added story yet -->
          <template v-else>
            <p class="saya-eyebrow mb-8 text-inverted/60">Our story</p>
            <h2 class="saya-display-md max-w-3xl text-inverted/30">Your brand story goes here.</h2>
            <p class="mt-6 max-w-lg text-sm leading-relaxed text-inverted/30">
              Two or three sentences about your brand — what you do, how you do it, why it matters.
            </p>
            <NuxtLink
              v-if="isAuthenticated"
              to="/dashboard"
              class="mt-8 inline-flex items-center gap-2 rounded-full border border-inverted/20 px-5 py-2.5 text-xs uppercase tracking-widest text-inverted/60 no-underline transition hover:border-inverted/40 hover:text-inverted/80"
            >
              Add your story in the dashboard →
            </NuxtLink>
          </template>
        </div>
      </section>

      <!-- ── Aggregated reviews ──────────────────────────────── -->
      <section
        v-if="featuredReviews.length || (hasGoogleBusiness && googleReviewSummary && Number(googleReviewSummary.average) > 0) || isAuthenticated"
        class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8"
      >
        <div class="mb-12 max-w-2xl">
          <p class="saya-kicker mb-6">Reviews</p>
          <template v-if="hasGoogleBusiness && googleReviewSummary && Number(googleReviewSummary.average) > 0">
            <h2 class="saya-display-md flex flex-wrap items-center gap-4 text-default">
              <UIcon name="i-heroicons-star-solid" class="size-8 text-primary" />
              {{ googleReviewSummary.average }}
              <span v-if="googleReviewSummary.count" class="text-muted">· {{ googleReviewSummary.count?.toLocaleString() }} reviews</span>
            </h2>
            <p class="mt-6 text-sm text-muted">Guest reviews &amp; ratings.</p>
          </template>
          <template v-else-if="isAuthenticated">
            <h2 class="saya-display-md text-default opacity-30">What your guests say.</h2>
            <p class="mt-6 text-sm text-muted opacity-50">No reviews yet.</p>
            <NuxtLink
              to="/dashboard"
              class="mt-4 inline-block text-xs uppercase tracking-widest text-default opacity-50 no-underline underline-offset-4 hover:underline hover:opacity-80"
            >
              Connect Google Business →
            </NuxtLink>
          </template>
          <template v-else>
            <h2 class="saya-display-md text-default">What our guests say.</h2>
          </template>
        </div>

        <!-- Location filter chips (multi-location only) -->
        <div v-if="locations.length > 1 && featuredReviews.length" class="mb-8 flex flex-wrap gap-2">
          <button
            :class="[
              'rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-widest transition',
              reviewFilter === 'all'
                ? 'border-inverted bg-inverted text-inverted'
                : 'border-default bg-default text-muted hover:border-muted hover:text-default'
            ]"
            @click="reviewFilter = 'all'"
          >
            All locations
          </button>
          <NuxtLink
            v-for="loc in locations"
            :key="loc.id"
            :to="`/locations/${loc.slug}/reviews`"
            class="rounded-full border border-default bg-default px-4 py-2 text-xs font-medium uppercase tracking-widest text-muted no-underline transition hover:border-muted hover:text-default"
          >
            {{ loc.title }}
          </NuxtLink>
        </div>

        <!-- Real reviews -->
        <div v-if="featuredReviews.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="review in featuredReviews"
            :key="review.id"
            class="bg-elevated p-8"
          >
            <div class="mb-3 flex gap-1">
              <UIcon
                v-for="s in 5"
                :key="s"
                name="i-heroicons-star-solid"
                class="size-3.5"
                :class="s <= googleReviewRating(review) ? 'text-primary' : 'text-muted'"
              />
            </div>
            <p class="text-sm leading-relaxed text-default">"{{ review.comment?.text || review.content }}"</p>
            <div class="mt-6 border-t border-default pt-4">
              <p class="text-sm font-medium text-default">{{ review.reviewer?.displayName || review.author_name }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ── CTA strip (strict component) ───────────────────── -->
      <LazySayaCTA
        :title="getField('cta.title')"
        :description="getField('cta.description')"
        :cta-route="homeCopy.ctaRoute"
        :reserve-cta="homeCopy.reserveCta"
        :bg="'default'"
        :padding="'lg'"
      />

      <!-- ── Dynamic content blocks ───────────────────────────── -->
      <template v-if="contentBlocks.length > 0">
        <component
          v-for="block in contentBlocks.filter(b => b.component)"
          :key="block._uid || block.field"
          :is="resolveComponent(block.component)"
          :data="block"
          class="content-block"
        />
      </template>
    </div>
  </NuxtLayout>
</template>

<script setup>
import { useAuth } from '~/composables/useAuth'
import { useOrganizationSchema } from '~/composables/useSchemaOrg'
import { formatMoneyAmount } from '~/shared/money'
import { useDynamicComponent } from '~/composables/useDynamicComponent'

definePageMeta({ layout: false })

const { isPlatform, siteId, site } = useTenantSite()
const homeCopy = getVerticalCopy(site?.vertical)
const { resolveComponent } = useDynamicComponent()

// Platform homepage data
const avatars = [
  { color: '#FB7461', letter: 'S' },
  { color: '#2BB5B5', letter: 'K' },
  { color: '#F8C546', letter: 'M' },
  { color: '#1F2547', letter: 'A' },
]
const features = [
  { icon: 'i-heroicons-paint-brush', title: 'Beautiful themes', body: 'Conversion-optimized themes for local businesses. Pick one, swap a color, you\'re live.' },
  { icon: 'i-heroicons-sparkles', title: 'AI-powered content', body: 'Compelling descriptions, details, translations — generated in one click.' },
  { icon: 'i-heroicons-globe-alt', title: 'Google Business sync', body: 'Hours, photos, offerings — pushed to Google so guests find the right info every time.' },
  { icon: 'i-heroicons-calendar-days', title: 'Bookings + waitlist', body: 'Take bookings 24/7 with WhatsApp confirmations. Walk-ins go on the waitlist automatically.', dark: true },
  { icon: 'i-heroicons-shopping-bag', title: 'Online ordering', body: 'Pickup & delivery with no commission. Stripe payouts straight to your bank.' },
  { icon: 'i-heroicons-chart-bar', title: 'Real-time insights', body: 'See visits, top items, busy hours — all in one dashboard.' },
]
const { isAuthenticated } = useAuth()

// Validate tenant context ONLY for tenant sites
if (!isPlatform && !siteId) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Site not found'
  })
}

// ── Single SSR call ───────────────────────────────────────────────────────
// Replaces: /locations + /google-business + /config + /content/home + /menus
// SayaHeader + SayaFooter share the same bootstrap key — zero duplicate calls.
const {
  locations: bootstrapLocations,
  googleBusiness: bootstrapGB,
  getField,
  getHero,
  config: bootstrapConfig,
  menuItemsBySection,
  experiencesList,
  contentBlocks,
} = useBootstrap()

const locations = computed(() => bootstrapLocations.value)
const hasLocations = computed(() => locations.value.length > 0)
const hasOrderLinks = computed(() =>
  locations.value.some(loc => loc.grab_url || loc.uber_eats_url || loc.foodpanda_url)
)

// Check if there's a menu
const hasMenu = computed(() => {
  const allItems = Object.values(menuItemsBySection.value).flat()
  return allItems.length > 0
})

const googleBusiness = computed(() => {
  const gb = bootstrapGB.value
  if (!gb) return null
  return {
    ...gb,
    media: gb.media && gb.media.length ? gb.media : [{ google_url: gb.business?.profile?.photoUrl || '' }],
    reviews: (gb.reviews || []).map((r) => ({
      ...r,
      author_name: r.author || r.reviewer?.displayName || r.author_name || 'Anonymous',
      date: r.date || r.createTime || r.updateTime
    }))
  }
})

const starRatingMap = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }
const businessTitle = computed(() => googleBusiness.value?.business?.title ?? null)
const businessSubtitle = computed(() => googleBusiness.value?.business?.profile?.description ?? null)
const businessPrimaryPhoto = computed(() => googleBusiness.value?.media?.[0])
const businessCity = computed(() => googleBusiness.value?.business?.city ?? null)
const googlePosts = computed(() => googleBusiness.value?.posts || [])
const googleReviews = computed(() => googleBusiness.value?.reviews ?? [])
const googleReviewRating = review => starRatingMap[review.starRating] ?? Number(review.starRating ?? review.rating ?? 0)
const googleReviewSummary = computed(() => {
  const summary = googleBusiness.value?.business?.reviewSummary
  if (!summary) {
    const ratings = googleReviews.value.map(googleReviewRating).filter(Boolean)
    if (ratings.length === 0) return null
    return { average: (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1), count: ratings.length }
  }
  const average = Number(summary.averageRating)
  if (!Number.isFinite(average) || average <= 0) return null
  return { average: average.toFixed(1), count: summary.totalReviewCount }
})

const restaurantName = computed(() => site?.brand_name || businessTitle.value || 'Restaurant')

// Hero from CMS with Google Business fallbacks
const hero = computed(() => getHero({
  title: businessTitle.value || '',
  subtitle: businessSubtitle.value || '',
  image: '',
  video: ''
}))

const currentPageUrl = useSeoUrl('/')
const sharedOgImage = useSharedOgImage()

// SEO for KrabiClaw Platform
if (isPlatform) {
  useOrganizationSchema()
  
  useSeoMeta({
    title: 'KrabiClaw | AI Website Builder for Local Businesses',
    description: 'Build your business website in minutes with AI. No coding required.',
    ogTitle: 'KrabiClaw | AI Website Builder for Local Businesses',
    ogDescription: 'Professional business websites with AI content and Google Business integration.',
    ogImage: sharedOgImage,
    ogUrl: currentPageUrl,
    ogType: 'website'
  })
}

// SEO for tenant sites: set ogUrl to the actual request URL so custom domains share correctly.
if (!isPlatform && siteId) {
  useSeoMeta({
    title: computed(() => `${restaurantName.value} | ${businessTitle.value || 'Restaurant'}`),
    description: computed(() => businessSubtitle.value || 'Professional restaurant website with menus, reservations, photos and reviews.'),
    ogImage: useSharedOgImage(() => hero.value.image),
    ogUrl: currentPageUrl,
    ogType: 'website'
  })
}

// Featured menu items from bootstrap menu
const featuredMenuItems = computed(() => {
  const allItems = Object.values(menuItemsBySection.value).flat()
  const featured = allItems
    .filter(item => item.available !== false && item.featured)
    .sort((a, b) => {
      if ((a.featured_sort_order ?? 0) !== (b.featured_sort_order ?? 0)) {
        return (a.featured_sort_order ?? 0) - (b.featured_sort_order ?? 0)
      }
      if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      return String(a.name ?? '').localeCompare(String(b.name ?? ''))
    })
  return (featured.length > 0 ? featured : allItems.filter(item => item.available !== false)).slice(0, 6)
})

// Featured experiences (used when no menu exists)
const featuredExperiences = computed(() => {
  const allExperiences = experiencesList.value || []
  const featured = allExperiences
    .filter(exp => exp.status === 'active' && exp.featured)
    .sort((a, b) => {
      const fa = Number(a.featured_sort_order ?? Infinity)
      const fb = Number(b.featured_sort_order ?? Infinity)
      if (fa !== fb) return fa - fb
      const sa = Number(a.sort_order ?? Infinity)
      const sb = Number(b.sort_order ?? Infinity)
      if (sa !== sb) return sa - sb
      return String(a.title ?? '').localeCompare(String(b.title ?? ''))
    })
  return (featured.length > 0 ? featured : allExperiences.filter(exp => exp.status === 'active')).slice(0, 6)
})
const defaultCurrency = computed(() => bootstrapConfig.value.default_currency || 'THB')

// Review location filter
const reviewFilter = ref('all')

const hasGoogleBusiness = computed(() => !!googleBusiness.value?.business)
const featuredReviews = computed(() => googleReviews.value.slice(0, 3))

// Recent posts — shown in the "Lately" section (posts only, each links to /posts)
const recentPosts = computed(() => {
  const posts = (googlePosts.value || []).filter(p => p.media?.[0]?.googleUrl)
  return posts.slice(0, 4).map((post, i) => ({
    id: post.name?.split('/').pop() || String(i),
    image: post.media?.[0]?.googleUrl || null,
    imageKind: post.media?.[0]?.kind || 'image',
    text: post.summary || post.name || '',
    alt: post.summary || 'Post image',
    wide: i === 0,
  }))
})

// Featured content — dishes or experiences, shown right below the hero
const featuredContent = computed(() => {
  const featuredItems = hasMenu.value ? featuredMenuItems.value : featuredExperiences.value
  return featuredItems.slice(0, 4).map(item => {
    if (hasMenu.value) {
      // For video assets use the extracted WebP thumbnail, not the MP4 URL.
      // Featured cards are small grid tiles — loading a video here wastes bandwidth
      // and causes a 300-500KB download before the card is even visible.
      const isVideo = item.kind === 'video'
      return {
        name: item.name,
        price: formatMoneyAmount(item.price_amount, defaultCurrency.value, ''),
        image: isVideo ? (item.thumbnail_url || null) : (item.public_url || null),
        imageKind: 'image',
        alt: item.name ? `${item.name} dish` : 'Featured dish image',
        href: item.slug ? `/menu/${item.slug}` : '/menu',
      }
    } else {
      return {
        name: item.title,
        price: item.price || '',
        image: item.image_url || null,
        imageKind: 'image',
        alt: item.title ? `${item.title} experience` : 'Featured experience image',
        href: item.slug ? `/experiences/${item.slug}` : '/experiences',
      }
    }
  })
})

</script>
