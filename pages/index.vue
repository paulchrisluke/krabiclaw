<template>
  <NuxtLayout :name="isPlatform ? 'platform' : 'saya'">
    <!-- KrabiClaw Platform Homepage -->
    <div v-if="isPlatform" class="bg-default">

      <!-- Hero -->
      <section class="relative overflow-hidden">
        <!-- Ambient gradient orbs -->
        <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div class="absolute -top-40 -right-32 w-[700px] h-[700px] rounded-full opacity-25 blur-3xl" style="background: radial-gradient(circle, var(--kc-coral-200) 0%, transparent 70%)"></div>
          <div class="absolute -bottom-20 -left-32 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl" style="background: radial-gradient(circle, var(--kc-teal-100) 0%, transparent 70%)"></div>
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[400px] rounded-full opacity-10 blur-3xl" style="background: radial-gradient(ellipse, var(--kc-navy-300) 0%, transparent 70%)"></div>
        </div>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32 grid lg:grid-cols-2 gap-12 items-center">
          <div class="flex flex-col gap-6">
            <!-- Eyebrow -->
            <span class="self-start inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.3em] uppercase text-(--kc-teal-600) bg-(--kc-teal-100) px-3.5 py-1.5 rounded-full border border-(--kc-teal)/20">
              <span class="w-1.5 h-1.5 rounded-full bg-(--kc-teal) shrink-0 animate-pulse" />
              Now on ChatGPT
            </span>

            <!-- Headline -->
            <h1 class="text-[clamp(40px,5vw,66px)] font-extrabold leading-[1.02] tracking-tight text-balance m-0">
              <span class="text-default">Your restaurant,</span><br>
              <span style="background: linear-gradient(135deg, var(--kc-coral) 0%, #e0524c 40%, var(--kc-coral-400) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">managed through</span><br>
              <span class="text-default">ChatGPT.</span>
            </h1>

            <p class="text-lg leading-relaxed text-muted m-0 max-w-lg">
              Sign up, add the KrabiClaw app in ChatGPT, and start editing your menus, content, and photos through conversation.
            </p>

            <!-- CTAs -->
            <div class="flex flex-wrap gap-3">
              <NuxtLink
                to="/signup"
                class="inline-flex items-center gap-2 font-semibold text-[15px] px-6 py-3.5 rounded-[10px] hover:opacity-90 transition-all no-underline text-white shadow-lg"
                style="background: linear-gradient(135deg, var(--kc-coral) 0%, #e0524c 100%); box-shadow: 0 4px 20px rgba(251,116,97,0.35);"
              >
                Start free
                <UIcon name="i-heroicons-arrow-right" class="size-4" />
              </NuxtLink>
              <NuxtLink
                to="/plugin"
                class="inline-flex items-center gap-2 bg-transparent text-(--kc-teal-600) border border-(--kc-teal)/50 font-semibold text-[15px] px-6 py-3.5 rounded-full hover:bg-(--kc-teal-100) transition-colors no-underline"
              >
                <UIcon name="i-heroicons-puzzle-piece" class="size-4" />
                Get the ChatGPT app
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
            <div class="relative max-w-lg w-full">
              <!-- Glow ring behind the card -->
              <div class="absolute inset-0 rounded-3xl blur-2xl opacity-30" style="background: linear-gradient(135deg, var(--kc-coral-200), var(--kc-teal-100));"></div>
              <div class="relative rounded-3xl p-7 shadow-2xl border border-default/50" style="background: linear-gradient(145deg, var(--kc-coral-50) 0%, #fff8f6 100%);">
                <img
                  src="/krabiclaw-login-mascot.png"
                  alt="KrabiClaw mascot"
                  class="w-full block rounded-[20px] shadow-lg"
                >
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Features -->
      <section id="features" class="relative py-24 overflow-hidden">
        <!-- Subtle gradient background -->
        <div class="absolute inset-0 -z-10" style="background: linear-gradient(180deg, var(--ui-bg-elevated) 0%, var(--ui-bg) 100%);"></div>
        <div class="absolute top-0 inset-x-0 h-px" style="background: linear-gradient(90deg, transparent 0%, var(--kc-border) 50%, transparent 100%);"></div>
        <div class="absolute bottom-0 inset-x-0 h-px" style="background: linear-gradient(90deg, transparent 0%, var(--kc-border) 50%, transparent 100%);"></div>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center max-w-2xl mx-auto mb-14 flex flex-col items-center gap-4">
            <span class="kc-eyebrow text-muted">Everything your business needs</span>
            <h2 class="text-[clamp(32px,4vw,48px)] font-extrabold tracking-tight leading-[1.05] m-0">
              <span class="text-default">Everything your site needs.</span><br>
              <span class="text-muted font-bold">Nothing you don't.</span>
            </h2>
          </div>
          <div class="grid md:grid-cols-3 gap-5">
            <div
              v-for="feat in features"
              :key="feat.title"
              class="group relative rounded-[18px] p-7 border border-default transition-all duration-300 hover:-translate-y-0.5 hover:border-(--kc-coral)/30 hover:shadow-lg bg-white dark:bg-(--ui-bg-elevated)"
            >
              <!-- Subtle gradient top highlight on hover -->
              <div
                class="absolute inset-x-0 top-0 h-px rounded-t-[18px] opacity-0 group-hover:opacity-100 transition-opacity"
                style="background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--kc-coral) 40%, transparent), transparent);"
              ></div>

              <div
                class="w-12 h-12 rounded-xl flex items-center justify-center mb-5 shadow-sm"
                style="background: linear-gradient(135deg, var(--kc-navy) 0%, var(--kc-navy-700) 100%); box-shadow: 0 4px 12px rgba(31,37,71,0.15);"
              >
                <UIcon :name="feat.icon" class="size-5 text-white" />
              </div>
              <h3
                class="text-lg font-bold mb-2 m-0 text-default"
              >{{ feat.title }}</h3>
              <p
                class="text-[14px] leading-relaxed m-0 text-muted"
              >{{ feat.body }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Pricing -->
      <section class="relative py-24 overflow-hidden">
        <!-- Ambient gradient -->
        <div class="pointer-events-none absolute inset-0 -z-10">
          <div class="absolute top-0 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-30" style="background: radial-gradient(circle, var(--kc-coral-200) 0%, transparent 70%);"></div>
          <div class="absolute bottom-0 left-1/4 w-[500px] h-[500px] rounded-full blur-3xl opacity-20" style="background: radial-gradient(circle, var(--kc-teal-100) 0%, transparent 70%);"></div>
        </div>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center max-w-2xl mx-auto mb-12 flex flex-col items-center gap-4">
            <span class="kc-eyebrow text-dimmed">Simple pricing</span>
            <h2 class="text-[clamp(32px,4vw,48px)] font-extrabold tracking-tight leading-[1.05] m-0">
              <span class="text-default">Start free.</span>
              <span style="background: linear-gradient(135deg, var(--kc-coral) 0%, var(--kc-teal) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"> Grow when you're ready.</span>
            </h2>
          </div>
          <div class="relative rounded-[28px] border border-default/60 p-6 sm:p-10 shadow-2xl backdrop-blur-sm" style="background: color-mix(in srgb, var(--ui-bg-elevated) 80%, transparent);">
            <LazyBillingPricingTable />
          </div>
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
        <!-- Background media — poster is always in SSR HTML (LCP candidate).
             Video deferred until window.load + idle, fades in after canplay. -->
        <div class="absolute inset-0">
          <!-- Poster image: present in SSR, fetchpriority high — this is the LCP element -->
          <img
            v-if="hero.thumbnail_url"
            :src="hero.thumbnail_url"
            alt="" aria-hidden="true" fetchpriority="high" decoding="async"
            class="absolute inset-0 h-full w-full object-cover"
          />
          <img
            v-else-if="hero.image && hero.imageKind === 'image'"
            :src="hero.image"
            alt="" aria-hidden="true" fetchpriority="high" decoding="async"
            class="absolute inset-0 h-full w-full object-cover"
          />
          <img
            v-else-if="businessPrimaryPhoto?.googleUrl"
            :src="businessPrimaryPhoto.googleUrl"
            alt="" aria-hidden="true" fetchpriority="high" decoding="async"
            class="absolute inset-0 h-full w-full object-cover"
          />

          <!-- Deferred video: not in SSR, starts opacity-0, fades in after canplay -->
          <ClientOnly v-if="hero.video && hero.videoKind === 'video'">
            <video
              v-if="heroVideoShow"
              ref="heroVideoEl"
              :poster="hero.thumbnail_url"
              muted loop playsinline preload="none"
              aria-hidden="true" role="presentation"
              class="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700"
            />
          </ClientOnly>
        </div>
        <div class="absolute inset-0" style="background: linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.3) 100%)" />
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
            <UButton v-if="hasOrderLinks" to="/order" color="neutral" variant="solid" size="xl" class="rounded-full bg-white! text-black! hover:bg-zinc-100!">{{ homeCopy.orderNowCta }}</UButton>
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
              :to="homeCopy.viewMenuRoute"
              color="neutral"
              variant="outline"
              size="xl"
              class="rounded-full border-white/50 text-white hover:bg-white/10"
            >
              {{ homeCopy.viewMenuCta }}
            </UButton>
          </div>
        </div>
      </section>

      <!-- ── Featured content (dishes / experiences) ─────────── -->
      <LazySayaFeaturedContent
        v-if="featuredContent.length"
        :data="{
          items: featuredContent,
          hasMenu: hasMenu,
          vertical: site?.vertical
        }"
      />

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
          <p class="saya-kicker mb-6">{{ homeCopy.findUsKicker }}</p>
          <h2 class="saya-display-md text-default">
            {{ homeCopy.locationGroupLine(locations.length) }}
          </h2>
        </div>
        <!-- Real locations -->
        <div v-if="hasLocations" :class="['grid gap-8', locations.length > 1 ? 'md:grid-cols-2' : '']">
          <NuxtLink
            v-for="(loc, locIdx) in locations"
            :key="loc.id"
            :ref="el => { const node = el && (el.$el || el); if (node) locCardRefs[locIdx] = node }"
            :to="`/locations/${loc.slug}`"
            class="group block overflow-hidden border border-default text-default no-underline transition hover:border-muted"
          >
            <div class="aspect-video overflow-hidden bg-muted">
              <!-- Poster image: always present for LCP. Video swaps in when card enters viewport. -->
              <ClientOnly v-if="loc.kind === 'video' && loc.public_url">
                <video
                  v-if="visibleLocCards.has(locIdx)"
                  :src="loc.public_url"
                  :poster="loc.thumbnail_url || undefined"
                  autoplay muted loop playsinline preload="none"
                  class="aspect-video w-full object-cover"
                />
                <img
                  v-else-if="loc.thumbnail_url"
                  :src="loc.thumbnail_url"
                  :alt="loc.title"
                  loading="lazy"
                  class="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-105"
                >
              </ClientOnly>
              <img
                v-else-if="loc.public_url"
                :src="loc.public_url"
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
                <span class="saya-eyebrow text-muted">{{ homeCopy.visitLocationCta }}</span>
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
                {{ i === 1 ? homeCopy.mainLocationLabel : homeCopy.secondLocationLabel }}
              </div>
              <p class="mt-4 text-sm text-muted">
                {{ i === 1 ? homeCopy.connectGoogleAddressNote : homeCopy.addSecondLocationNote }}
              </p>
            </div>
          </div>
          <div v-if="isAuthenticated" class="md:col-span-2 text-center pt-2">
            <UButton to="/dashboard" color="neutral" variant="outline" size="sm" class="rounded-full">
              {{ homeCopy.connectGoogleCta }}
            </UButton>
          </div>
        </div>
      </section>

      <!-- ── Posts / Lately ────────────────────────────────── -->
      <section v-if="recentPosts.length" class="bg-elevated">
        <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div class="mb-16 max-w-2xl">
            <p class="saya-kicker mb-6">{{ homeCopy.latelyKicker }}</p>
            <h2 class="saya-display-md text-default">{{ homeCopy.highlightsSectionHeading }}</h2>
          </div>
          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <UModal
              v-for="post in recentPosts"
              :key="post.id"
              fullscreen
              :portal="false"
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
                  <p class="mt-3 saya-eyebrow text-muted opacity-60">{{ homeCopy.readMoreCta }}</p>
                </div>
              </article>

              <!-- Modal: full post -->
              <template #body>
                <UCard
                  class="relative h-full w-full overflow-hidden border-0 bg-transparent shadow-none"
                  :ui="{ body: 'p-0 sm:p-0' }"
                >
                  <!-- Media - full bleed -->
                  <div v-if="post.image" class="h-full w-full">
                    <video
                      v-if="post.imageKind === 'video'"
                      :src="post.image"
                      autoplay
                      muted
                      loop
                      playsinline
                      class="h-full w-full object-cover"
                    />
                    <img
                      v-else
                      :src="post.image"
                      :alt="post.alt"
                      class="h-full w-full object-cover"
                    >
                  </div>

                  <!-- Content overlay at bottom -->
                  <UCard
                    class="absolute bottom-0 left-0 right-0 z-20 border-0 bg-linear-to-t from-black/90 via-black/60 to-transparent shadow-none"
                    :ui="{ body: 'p-6 pt-32 sm:p-6 sm:pt-32' }"
                  >
                    <p class="saya-eyebrow mb-3 text-white/60 text-[10px] font-bold uppercase tracking-widest">{{ homeCopy.postsEyebrow }}</p>
                    <p class="text-white/90 text-sm leading-relaxed whitespace-pre-line">{{ post.text }}</p>
                  </UCard>
                </UCard>
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
                <p class="saya-eyebrow mb-8 text-inverted/60">{{ homeCopy.ourStoryKicker }}</p>
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
                  {{ homeCopy.readMoreCta }}
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
            <p class="saya-eyebrow mb-8 text-inverted/60">{{ homeCopy.ourStoryKicker }}</p>
            <h2 class="saya-display-md max-w-3xl text-inverted/30">{{ homeCopy.brandStoryPlaceholder }}</h2>
            <p class="mt-6 max-w-lg text-sm leading-relaxed text-inverted/30">
              {{ homeCopy.brandStoryDescription }}
            </p>
            <NuxtLink
              v-if="isAuthenticated"
              to="/dashboard"
              class="mt-8 inline-flex items-center gap-2 rounded-full border border-inverted/20 px-5 py-2.5 text-xs uppercase tracking-widest text-inverted/60 no-underline transition hover:border-inverted/40 hover:text-inverted/80"
            >
              {{ homeCopy.addStoryCta }}
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
          <p class="saya-kicker mb-6">{{ homeCopy.reviewsKicker }}</p>
          <template v-if="hasGoogleBusiness && googleReviewSummary && Number(googleReviewSummary.average) > 0">
            <h2 class="saya-display-md flex flex-wrap items-center gap-4 text-default">
              <UIcon name="i-heroicons-star-solid" class="size-8 text-primary" />
              {{ googleReviewSummary.average }}
              <span v-if="googleReviewSummary.count" class="text-muted">· {{ googleReviewSummary.count?.toLocaleString() }} reviews</span>
            </h2>
            <p class="mt-6 text-sm text-muted">{{ homeCopy.guestReviewsLabel }}</p>
          </template>
          <template v-else-if="isAuthenticated">
            <h2 class="saya-display-md text-default opacity-30">{{ homeCopy.whatGuestsSayLabel }}</h2>
            <p class="mt-6 text-sm text-muted opacity-50">{{ homeCopy.noReviewsLabel }}</p>
            <NuxtLink
              to="/dashboard"
              class="mt-4 inline-block text-xs uppercase tracking-widest text-default opacity-50 no-underline underline-offset-4 hover:underline hover:opacity-80"
            >
              {{ homeCopy.connectGoogleReviewsCta }}
            </NuxtLink>
          </template>
          <template v-else>
            <h2 class="saya-display-md text-default">{{ homeCopy.whatGuestsSayLabel }}</h2>
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
            {{ homeCopy.allLocationsFilter }}
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
const { locale } = useI18n()
const homeCopy = computed(() => getVerticalCopy(site?.vertical, locale.value))

// Inline location grid — load videos via IntersectionObserver when cards scroll into view
const locCardRefs = ref([])
const visibleLocCards = ref(new Set())
onMounted(() => {
  if (!('IntersectionObserver' in window)) return
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return
      const i = locCardRefs.value.indexOf(entry.target)
      if (i >= 0) { visibleLocCards.value = new Set([...visibleLocCards.value, i]); obs.unobserve(entry.target) }
    })
  }, { rootMargin: '200px' })
  watch(() => locations.value.length, () => { nextTick(() => locCardRefs.value.forEach(el => el && obs.observe(el))) }, { immediate: true })
  onUnmounted(() => obs.disconnect())
})
const { resolveComponent } = useDynamicComponent()

// Platform homepage data
const avatars = [
  { color: '#FB7461', letter: 'S' },
  { color: '#2BB5B5', letter: 'K' },
  { color: '#F8C546', letter: 'M' },
  { color: '#1F2547', letter: 'A' },
]
const features = [
  { icon: 'i-heroicons-chat-bubble-left-right', title: 'Edit through ChatGPT', body: 'Update menus, content, and photos by talking to ChatGPT. No CMS to learn.' },
  { icon: 'i-heroicons-paint-brush', title: 'Beautiful themes', body: 'Conversion-optimized themes for local businesses. Pick one, swap a color, you\'re live.' },
  { icon: 'i-heroicons-globe-alt', title: 'Google Business sync', body: 'Hours, photos, offerings — pushed to Google so guests find the right info every time.' },
  { icon: 'i-heroicons-calendar-days', title: 'Bookings + waitlist', body: 'Take bookings 24/7 with WhatsApp confirmations. Walk-ins go on the waitlist automatically.' },
  { icon: 'i-heroicons-shopping-bag', title: 'Online ordering', body: 'Pickup & delivery with no commission. Stripe payouts straight to your bank.' },
  { icon: 'i-heroicons-chart-bar', title: 'Real-time insights', body: 'See visits, top pages, and busy hours — ask ChatGPT or check the analytics tab.' },
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

const restaurantName = computed(() => site?.brand_name || businessTitle.value || 'Business')

// Hero from CMS with Google Business fallbacks
const hero = computed(() => getHero({
  title: businessTitle.value || '',
  subtitle: businessSubtitle.value || '',
  image: '',
  video: ''
}))

const { videoEl: heroVideoEl, showVideo: heroVideoShow } = useHeroVideo(() => hero.value?.video)

const currentPageUrl = useSeoUrl('/')
const sharedOgImage = useSharedOgImage()

// SEO for KrabiClaw Platform
if (isPlatform) {
  useOrganizationSchema()
  
  const platformDescription = 'Sign up, add the KrabiClaw app in ChatGPT, and manage your restaurant website through conversation. Menus, content, photos — no CMS required.'
  const platformOgDescription = 'Beautiful restaurant websites edited through ChatGPT. Google Business sync, bookings, and real-time analytics included.'

  useSeoMeta({
    title: 'KrabiClaw | Restaurant Websites Managed Through ChatGPT',
    description: truncateForSeo(platformDescription, 160),
    ogTitle: 'KrabiClaw | Restaurant Websites Managed Through ChatGPT',
    ogDescription: truncateForSeo(platformOgDescription, 160),
    ogSiteName: 'KrabiClaw',
    twitterTitle: 'KrabiClaw | Restaurant Websites Managed Through ChatGPT',
    twitterDescription: truncateForSeo(platformOgDescription, 160),
    ogImage: sharedOgImage,
    ogUrl: currentPageUrl,
    ogType: 'website'
  })
}

// SEO for tenant sites: set ogUrl to the actual request URL so custom domains share correctly.
if (!isPlatform && siteId) {
  const seoTitle = computed(() => {
    const primary = (restaurantName.value || '').trim()
    const secondary = (businessTitle.value || 'Business').trim() || 'Business'
    if (!primary || primary.toLowerCase() === secondary.toLowerCase()) {
      return secondary
    }
    return `${primary} | ${secondary}`
  })

  const seoDescription = computed(() =>
    truncateForSeo(businessSubtitle.value || 'Professional business website with photos, updates and reviews.', 160)
  )

  useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogSiteName: computed(() => site?.brand_name || restaurantName.value),
    twitterTitle: seoTitle,
    twitterDescription: seoDescription,
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
