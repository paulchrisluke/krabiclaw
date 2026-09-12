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
            <h1 class="text-[clamp(40px,5vw,66px)] font-bold leading-[1.02] tracking-tight text-balance m-0">
              <span class="text-default">Your local business,</span><br>
              <span style="background: linear-gradient(135deg, var(--kc-coral) 0%, #e0524c 40%, var(--kc-coral-400) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">managed through</span><br>
              <span class="text-default">ChatGPT.</span>
            </h1>

            <p class="text-lg leading-relaxed text-muted m-0 max-w-lg">
              Continue with Google, WhatsApp, or email, add the KrabiClaw app in ChatGPT, and start editing through conversation.
            </p>

            <!-- CTAs -->
            <div class="flex flex-wrap gap-3">
              <PlatformAccountCta variant="gradient" size="xl" />
              <PlatformButton to="/plugin" variant="outline" size="xl">
                <PlatformIcon name="puzzle" class="size-4" />
                Get the ChatGPT app
              </PlatformButton>
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

      <!-- Solutions By Industry Section -->
      <section id="solutions" class="py-20 border-t border-default bg-elevated/20">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center max-w-2xl mx-auto mb-14 flex flex-col items-center gap-3">
            <span class="kc-eyebrow text-primary">Tailored Operating Layers</span>
            <h2 class="text-3xl sm:text-4xl font-bold tracking-tight text-default m-0">
              Built for your specific industry
            </h2>
            <p class="text-base text-muted m-0">
              Every vertical gets the exact schema, customer journey, and conversational tools it needs.
            </p>
          </div>

          <div class="grid md:grid-cols-3 gap-6">
            <NuxtLink
              to="/restaurants"
              class="group rounded-3xl p-8 border border-default bg-elevated/40 hover:bg-elevated/70 hover:border-primary/40 transition-all duration-300 no-underline flex flex-col justify-between shadow-sm hover:shadow-md"
            >
              <div>
                <div class="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6 border border-primary/20">
                  <PlatformIcon name="utensils" class="size-6" />
                </div>
                <h3 class="text-xl font-bold text-default mb-2 group-hover:text-primary transition-colors">Restaurants</h3>
                <p class="text-sm text-muted leading-relaxed mb-6">
                  Crawlable HTML menus, Google Places sync, and direct table reservations with zero per-cover commissions.
                </p>
              </div>
              <div class="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                Learn about Restaurants on Tap →
              </div>
            </NuxtLink>

            <NuxtLink
              to="/experiences"
              class="group rounded-3xl p-8 border border-default bg-elevated/40 hover:bg-elevated/70 hover:border-(--kc-teal)/50 transition-all duration-300 no-underline flex flex-col justify-between shadow-sm hover:shadow-md"
            >
              <div>
                <div class="size-12 rounded-2xl bg-(--kc-teal)/10 text-(--kc-teal-600) flex items-center justify-center mb-6 border border-(--kc-teal)/20">
                  <PlatformIcon name="calendar" class="size-6" />
                </div>
                <h3 class="text-xl font-bold text-default mb-2 group-hover:text-(--kc-teal-600) transition-colors">Experiences & Studios</h3>
                <p class="text-sm text-muted leading-relaxed mb-6">
                  Time-slot scheduling, capacity safeguards, and direct booking for workshops, classes, and tours without marketplace cuts.
                </p>
              </div>
              <div class="inline-flex items-center gap-1 text-sm font-semibold text-(--kc-teal-600)">
                Explore Experience Solutions →
              </div>
            </NuxtLink>

            <NuxtLink
              to="/legal"
              class="group rounded-3xl p-8 border border-default bg-elevated/40 hover:bg-elevated/70 hover:border-(--kc-navy-700)/50 transition-all duration-300 no-underline flex flex-col justify-between shadow-sm hover:shadow-md"
            >
              <div>
                <div class="size-12 rounded-2xl bg-(--kc-navy)/10 text-default flex items-center justify-center mb-6 border border-default">
                  <PlatformIcon name="briefcase" class="size-6 text-primary" />
                </div>
                <h3 class="text-xl font-bold text-default mb-2 group-hover:text-primary transition-colors">Legal & Professional</h3>
                <p class="text-sm text-muted leading-relaxed mb-6">
                  Practice area architecture, consultation intake, compliance notices, and schema.org LegalService graphs powered by Blawby.
                </p>
              </div>
              <div class="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                Explore Blawby for Practices →
              </div>
            </NuxtLink>
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
            <h2 class="text-[clamp(32px,4vw,48px)] font-bold tracking-tight leading-[1.05] m-0">
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
            <h2 class="text-[clamp(32px,4vw,48px)] font-bold tracking-tight leading-[1.05] m-0 text-default">
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
const features = [
  { icon: 'message-circle', title: 'Edit through ChatGPT', body: 'Update menus, offerings, photos, and news by talking to ChatGPT. No complex CMS to learn.' },
  { icon: 'bar-chart', title: 'Conversational Analytics', body: 'Ask ChatGPT about your traffic, most viewed offerings, and busiest days. Turn data into marketing moves.' },
  { icon: 'globe', title: 'Google Places Sync', body: 'Automatically import and refresh hours, address, ratings, and reviews so your site matches Google Maps.' },
  { icon: 'calendar', title: 'Bookings & Reservations', body: 'Accept table reservations and ticketed experience bookings with automated confirmations and zero per-cover fees.' },
  { icon: 'sparkles', title: 'Social & Blog Publishing', body: 'Publish thought leadership, news, and seasonal specials to your website and social channels simultaneously.' },
  { icon: 'inbox', title: 'Unified Inbox', body: 'Manage all your reservations, bookings, and contact inquiries from a single, unified inbox.' },
] as const

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
})
</script>
