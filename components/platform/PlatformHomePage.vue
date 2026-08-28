<template>
    <!-- KrabiClaw Platform Homepage -->
    <div  class="bg-default">

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
              <span class="text-default">Your local business,</span><br>
              <span style="background: linear-gradient(135deg, var(--kc-coral) 0%, #e0524c 40%, var(--kc-coral-400) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">managed through</span><br>
              <span class="text-default">ChatGPT.</span>
            </h1>

            <p class="text-lg leading-relaxed text-muted m-0 max-w-lg">
              Continue with Google, WhatsApp, or email, add the KrabiClaw app in ChatGPT, and start editing through conversation.
            </p>

            <!-- CTAs -->
            <div class="flex flex-wrap gap-3">
              <NuxtLink
                to="/signup"
                class="inline-flex items-center gap-2 font-semibold text-[15px] px-6 py-3.5 rounded-[10px] hover:opacity-90 transition-all no-underline text-white shadow-lg"
                style="background: linear-gradient(135deg, var(--kc-coral) 0%, #e0524c 100%); box-shadow: 0 4px 20px rgba(251,116,97,0.35);"
              >
                Start free
                <PlatformIcon name="arrow-right" class="size-4" />
              </NuxtLink>
              <NuxtLink
                to="/plugin"
                class="inline-flex items-center gap-2 bg-transparent text-(--kc-teal-600) border border-(--kc-teal)/50 font-semibold text-[15px] px-6 py-3.5 rounded-full hover:bg-(--kc-teal-100) transition-colors no-underline"
              >
                <PlatformIcon name="puzzle" class="size-4" />
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
                <picture>
                  <source media="(min-width: 992px)" srcset="/krabiclaw-login-mascot.webp">
                  <img
                    src="data:image/gif;base64,R0lGODlhAQABAAAAACw="
                    alt="KrabiClaw mascot"
                    width="1200"
                    height="1200"
                    loading="eager"
                    fetchpriority="high"
                    decoding="async"
                    class="w-full block rounded-[20px] shadow-lg"
                  >
                </picture>
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
                <PlatformIcon :name="feat.icon" class="size-5 text-white" />
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
      <section id="pricing" class="relative py-24 overflow-hidden">
        <div class="absolute inset-0 -z-10" style="background: linear-gradient(180deg, var(--ui-bg) 0%, var(--ui-bg-elevated) 100%);"></div>
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center max-w-2xl mx-auto mb-14 flex flex-col items-center gap-4">
            <span class="kc-eyebrow text-muted">Simple, transparent pricing</span>
            <h2 class="text-[clamp(32px,4vw,48px)] font-extrabold tracking-tight leading-[1.05] m-0 text-default">
              Start free. Grow when you're ready.
            </h2>
            <p class="text-lg leading-relaxed text-muted m-0">
              Build your site with the free KrabiClaw ChatGPT app, then add the tools your business needs.
            </p>
          </div>
          <BillingPricingTable v-if="plans" :plans="plans" />
        </div>
      </section>

    </div>

    <!-- Blawby tenant homepage -->

</template>

<script setup lang="ts">
const avatars = [
  { color: '#FB7461', letter: 'S' },
  { color: '#2BB5B5', letter: 'K' },
  { color: '#F8C546', letter: 'M' },
  { color: '#1F2547', letter: 'A' },
]
const features = [
  { icon: 'message-circle', title: 'Edit through ChatGPT', body: 'Update menus, content, and photos by talking to ChatGPT. No CMS to learn.' },
  { icon: 'sparkles', title: 'Beautiful themes', body: 'Conversion-optimized themes for local businesses. Pick one, swap a color, you\'re live.' },
  { icon: 'globe', title: 'Google Places imports', body: 'Import hours, address, ratings, and reviews so your website reflects the place guests already know.' },
  { icon: 'calendar', title: 'Bookings + waitlist', body: 'Take bookings 24/7 with WhatsApp confirmations. Walk-ins go on the waitlist automatically.' },
  { icon: 'inbox', title: 'Full Inbox', body: 'Manage all your reservations, bookings, and contact inquiries from a single, unified inbox.' },
  { icon: 'bar-chart', title: 'Real-time insights', body: 'See visits, top pages, and busy hours — ask ChatGPT or check the analytics tab.' },
]

const { plans } = usePlans()

useSocialMetadata({
  template: 'platform',
  path: '/',
  title: 'Local SEO Websites Managed Through ChatGPT',
  description: 'Beautiful local business websites edited through ChatGPT. Google Places imports, bookings, and real-time analytics included.',
  isHomepage: true,
  breadcrumbs: [
    { name: 'Home', url: '/' },
  ],
  ownerType: 'platform',
  ownerId: 'home',
})
</script>
