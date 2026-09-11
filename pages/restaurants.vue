<template>
  <NuxtLayout name="platform">
    <div v-if="isPlatform" class="relative overflow-hidden py-16 sm:py-24">
    <!-- Ambient Background Mesh -->
    <div class="absolute top-0 left-1/4 -z-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-60"></div>
    <div class="absolute bottom-1/3 right-1/4 -z-10 w-112.5 h-112.5 bg-(--kc-teal)/10 rounded-full blur-3xl opacity-50"></div>

    <div class="container mx-auto px-4 max-w-7xl">
      <!-- ── 1. Hero Section ────────────────────────────────────────── -->
      <div class="text-center max-w-3xl mx-auto mb-20 flex flex-col items-center gap-6">
        <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
          <PlatformIcon name="utensils" class="size-3.5" />
          Restaurants on Tap
        </span>
        <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05] text-default m-0 text-balance">
          Stop paying per-cover fees. <br class="hidden sm:inline" />
          <span class="bg-gradient-to-r from-primary via-(--kc-coral) to-(--kc-teal) bg-clip-text text-transparent">
            A 5-star restaurant website, updated in ChatGPT.
          </span>
        </h1>
        <p class="text-lg sm:text-xl text-muted leading-relaxed m-0 text-balance">
          Crawlable HTML menus, automated Google Places sync, and direct table reservations with zero commissions — managed completely through conversation.
        </p>
        <div class="flex flex-wrap items-center justify-center gap-4 mt-2">
          <PlatformAccountCta label="Start Free for Restaurants" size="lg" class="shadow-sm transition-transform hover:-translate-y-0.5" />
          <PlatformButton to="/pricing" variant="outline" size="lg" class="transition-transform hover:-translate-y-0.5">
            View Pricing
          </PlatformButton>
        </div>
      </div>

      <!-- ── 2. The Aggregator Trap vs KrabiClaw Matrix ─────────────── -->
      <div class="grid md:grid-cols-2 gap-8 mb-24 max-w-5xl mx-auto">
        <!-- The Old Way -->
        <div class="rounded-3xl border border-default/60 bg-elevated/30 p-8 flex flex-col justify-between">
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-red-500/10 text-red-500 mb-6 border border-red-500/20">
              <PlatformIcon name="x" class="size-3.5" />
              The Aggregator & PDF Trap
            </div>
            <h3 class="text-2xl font-bold text-default mb-4">Why traditional restaurant websites fail</h3>
            <ul class="space-y-4 p-0 list-none text-sm text-muted">
              <li class="flex items-start gap-3">
                <span class="size-5 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✕</span>
                <span><strong>Heavy Commissions:</strong> Booking platforms charge you for every seated diner, and delivery portals take a cut of every ticket.</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="size-5 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✕</span>
                <span><strong>Unsearchable PDF Menus:</strong> Google crawlers can't index your dishes, and diners struggle to pinch-and-zoom on mobile devices.</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="size-5 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✕</span>
                <span><strong>Hours Out of Sync:</strong> Updating holiday hours across Google Maps, Instagram, and website requires logging into multiple separate backends.</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="size-5 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✕</span>
                <span><strong>Agency Retainers:</strong> Simple price changes take days and cost hundreds in developer invoices.</span>
              </li>
            </ul>
          </div>
        </div>

        <!-- The KrabiClaw Way -->
        <div class="rounded-3xl border border-primary/30 bg-elevated/80 p-8 flex flex-col justify-between relative shadow-xl shadow-primary/5">
          <div class="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-bl-full pointer-events-none"></div>
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-primary/15 text-primary mb-6 border border-primary/25">
              <PlatformIcon name="check" class="size-3.5" />
              The KrabiClaw Operating Layer
            </div>
            <h3 class="text-2xl font-bold text-default mb-4">Direct diners. Zero per-cover fees.</h3>
            <ul class="space-y-4 p-0 list-none text-sm text-default/90">
              <li class="flex items-start gap-3">
                <PlatformIcon name="check-circle" class="size-5 text-(--kc-teal) shrink-0 mt-0.5" />
                <span><strong>0% Commission Bookings:</strong> Whether you seat 50 or 5,000 diners, your reservation fees stay zero forever.</span>
              </li>
              <li class="flex items-start gap-3">
                <PlatformIcon name="check-circle" class="size-5 text-(--kc-teal) shrink-0 mt-0.5" />
                <span><strong>Crawlable HTML Menus:</strong> Every dish, dietary tag, and allergen filter is high-ranking HTML visible to Google and AI answer engines.</span>
              </li>
              <li class="flex items-start gap-3">
                <PlatformIcon name="check-circle" class="size-5 text-(--kc-teal) shrink-0 mt-0.5" />
                <span><strong>Google Places Auto-Sync:</strong> Hours, addresses, star ratings, and reviews sync automatically from your Google Business Profile.</span>
              </li>
              <li class="flex items-start gap-3">
                <PlatformIcon name="check-circle" class="size-5 text-(--kc-teal) shrink-0 mt-0.5" />
                <span><strong>Edit in ChatGPT:</strong> Tell ChatGPT <em>"Add our autumn pumpkin soup to the dinner specials"</em> and it's instantly live.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- ── 3. Conversational Workflows Teardown ────────────────────── -->
      <div class="rounded-3xl border border-default bg-elevated/40 p-8 sm:p-12 mb-24 max-w-5xl mx-auto backdrop-blur-md">
        <div class="text-center max-w-2xl mx-auto mb-10">
          <span class="kc-eyebrow text-primary">Conversational Management</span>
          <h2 class="text-3xl font-extrabold text-default mt-2">What managing a restaurant in ChatGPT looks like</h2>
          <p class="text-sm text-muted mt-2">No passwords to remember, no complex CMS menus. Just ask.</p>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          <!-- Workflow 1 -->
          <div class="rounded-2xl border border-default bg-default p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div class="flex items-center gap-2 mb-4 text-xs font-bold uppercase text-(--kc-coral)">
                <PlatformIcon name="message-circle" class="size-4" />
                Menu Updates
              </div>
              <div class="rounded-xl bg-muted/40 p-3 text-xs font-mono text-muted mb-4 border border-default/50">
                “Add our grilled sea bass with lemon butter for 420 THB to the mains section, and tag it gluten-free.”
              </div>
              <p class="text-[13px] text-muted leading-relaxed m-0">
                ChatGPT verifies the section, adds the dish with schema markup, and updates your live menu immediately.
              </p>
            </div>
          </div>

          <!-- Workflow 2 -->
          <div class="rounded-2xl border border-default bg-default p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div class="flex items-center gap-2 mb-4 text-xs font-bold uppercase text-(--kc-teal)">
                <PlatformIcon name="bar-chart" class="size-4" />
                Live Analytics
              </div>
              <div class="rounded-xl bg-muted/40 p-3 text-xs font-mono text-muted mb-4 border border-default/50">
                “How many visitors looked at our dessert menu this week, and what was our busiest booking day?”
              </div>
              <p class="text-[13px] text-muted leading-relaxed m-0">
                ChatGPT inspects your first-party analytics ledger and returns instant visit trends and conversion stats.
              </p>
            </div>
          </div>

          <!-- Workflow 3 -->
          <div class="rounded-2xl border border-default bg-default p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div class="flex items-center gap-2 mb-4 text-xs font-bold uppercase text-primary">
                <PlatformIcon name="sparkles" class="size-4" />
                Social & Marketing
              </div>
              <div class="rounded-xl bg-muted/40 p-3 text-xs font-mono text-muted mb-4 border border-default/50">
                “Take our 5-star reviews from last weekend and publish a thank-you post to our website and Facebook.”
              </div>
              <p class="text-[13px] text-muted leading-relaxed m-0">
                Generates a clean update from authentic diner feedback and publishes it across channels simultaneously.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 4. Verified Client Proof: Kikuzuki ─────────────────────── -->
      <div class="relative rounded-[28px] overflow-hidden border border-default p-8 sm:p-12 mb-24 bg-(--kc-navy) text-white shadow-2xl">
        <div class="absolute -top-32 -right-32 w-80 h-80 bg-primary/20 rounded-full blur-3xl opacity-80"></div>
        <div class="relative z-10 grid lg:grid-cols-12 gap-8 items-center">
          <div class="lg:col-span-7 space-y-6">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-white/10 text-white/90 border border-white/20">
              <PlatformIcon name="map-pin" class="size-3.5 text-(--kc-teal)" />
              Verified Production Showcase
            </span>
            <h2 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-white m-0">
              How Kikuzuki runs multi-location dining with KrabiClaw
            </h2>
            <p class="text-white/80 text-[15px] sm:text-base leading-relaxed m-0">
              Kikuzuki operates two distinct branches in <strong>Ao Nang</strong> and <strong>Krabi Town</strong>. With KrabiClaw, both locations share a cohesive editorial brand while maintaining independent Google Places sync, location-specific menus, separate opening hours, and dedicated guest review feeds.
            </p>
            <div class="grid sm:grid-cols-3 gap-4 pt-2">
              <div class="rounded-xl bg-white/5 border border-white/10 p-4">
                <div class="text-2xl font-black text-white">2</div>
                <div class="text-xs text-white/70 mt-0.5">Independent Branches</div>
              </div>
              <div class="rounded-xl bg-white/5 border border-white/10 p-4">
                <div class="text-2xl font-black text-(--kc-teal)">0%</div>
                <div class="text-xs text-white/70 mt-0.5">Reservation Commissions</div>
              </div>
              <div class="rounded-xl bg-white/5 border border-white/10 p-4">
                <div class="text-2xl font-black text-(--kc-coral)">100%</div>
                <div class="text-xs text-white/70 mt-0.5">Crawlable HTML Menu</div>
              </div>
            </div>
          </div>
          <div class="lg:col-span-5 flex justify-center">
            <div class="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur-md shadow-xl w-full max-w-sm space-y-4">
              <div class="flex items-center justify-between border-b border-white/10 pb-4">
                <div class="font-bold text-white text-base">Kikuzuki Japanese Dining</div>
                <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-(--kc-teal)/20 text-(--kc-teal)">Saya Theme</span>
              </div>
              <div class="space-y-2 text-xs text-white/80">
                <div class="flex justify-between py-1 border-b border-white/5">
                  <span class="text-white/60">Ao Nang Branch</span>
                  <span>Open • Closes 22:00</span>
                </div>
                <div class="flex justify-between py-1 border-b border-white/5">
                  <span class="text-white/60">Krabi Town Branch</span>
                  <span>Open • Closes 21:30</span>
                </div>
                <div class="flex justify-between py-1 border-b border-white/5">
                  <span class="text-white/60">Google Reviews</span>
                  <span class="text-(--kc-coral) font-semibold">★ 4.8 (Synced)</span>
                </div>
              </div>
              <div class="pt-2">
                <PlatformButton to="/templates/saya" variant="outline" size="sm" class="w-full text-white border-white/30 hover:bg-white/10 justify-center">
                  Explore Saya Template →
                </PlatformButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 5. Features Grid ───────────────────────────────────────── -->
      <div class="max-w-6xl mx-auto mb-24">
        <div class="text-center max-w-2xl mx-auto mb-14">
          <span class="kc-eyebrow text-muted">Complete Operational Suite</span>
          <h2 class="text-3xl sm:text-4xl font-extrabold text-default mt-2">Built for restaurants that take hospitality seriously</h2>
        </div>
        <div class="grid md:grid-cols-3 gap-6">
          <div
            v-for="feat in restaurantFeatures"
            :key="feat.title"
            class="rounded-2xl border border-default bg-elevated/40 p-7 hover:border-primary/40 transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div class="size-11 rounded-xl bg-(--kc-navy) text-white flex items-center justify-center mb-5 shadow-sm">
                <PlatformIcon :name="feat.icon" class="size-5" />
              </div>
              <h3 class="text-lg font-bold text-default mb-2">{{ feat.title }}</h3>
              <p class="text-sm text-muted leading-relaxed m-0">{{ feat.desc }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 6. FAQ Section ─────────────────────────────────────────── -->
      <div class="max-w-4xl mx-auto mb-24">
        <h2 class="text-3xl font-extrabold text-default text-center mb-12">Frequently Asked Restaurant Questions</h2>
        <div class="grid sm:grid-cols-2 gap-6">
          <div
            v-for="faq in faqs"
            :key="faq.q"
            class="bg-elevated/40 border border-default p-6 rounded-2xl flex flex-col gap-2"
          >
            <h4 class="text-base font-bold text-default m-0 flex items-center gap-2">
              <PlatformIcon name="question-circle" class="size-5 text-primary shrink-0" />
              {{ faq.q }}
            </h4>
            <p class="text-[13.5px] leading-relaxed text-muted m-0">{{ faq.a }}</p>
          </div>
        </div>
      </div>

      <!-- ── 7. Bottom CTA ──────────────────────────────────────────── -->
      <div class="rounded-3xl border border-default bg-elevated p-10 sm:p-16 text-center max-w-4xl mx-auto shadow-sm flex flex-col items-center gap-6">
        <h2 class="text-3xl sm:text-4xl font-extrabold text-default m-0">Launch your restaurant site free today</h2>
        <p class="text-base sm:text-lg text-muted max-w-xl m-0 leading-relaxed">
          Create your site in minutes, connect the KrabiClaw app in ChatGPT, and start taking direct bookings with zero per-cover fees.
        </p>
        <div class="flex flex-wrap gap-4">
          <PlatformAccountCta label="Start Free" size="lg" class="shadow-sm" />
          <PlatformButton to="/pricing" variant="outline" size="lg">
            View All Plans
          </PlatformButton>
        </div>
      </div>
    </div>
    </div>
    <TenantPublicPage v-else path="/restaurants" />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const { isPlatform } = useTenantSite()

const restaurantFeatures = [
  {
    icon: 'list',
    title: 'Crawlable HTML Menus',
    desc: 'Categorized sections, item photos, dietary badges (vegan, gluten-free, spicy), and prices rendered in clean semantic HTML that Google loves.'
  },
  {
    icon: 'globe',
    title: 'Google Places Sync',
    desc: 'Automatically import and refresh opening hours, street addresses, star ratings, and Google reviews directly to your live storefront.'
  },
  {
    icon: 'calendar',
    title: 'Zero-Fee Table Reservations',
    desc: 'Direct guest booking with automated confirmations via email and WhatsApp. No per-seat commissions or monthly reservation surcharges.'
  },
  {
    icon: 'inbox',
    title: 'Unified Guest Inbox',
    desc: 'Manage contact inquiries, table booking requests, and guest notes in a single dashboard workspace.'
  },
  {
    icon: 'bar-chart',
    title: 'Conversational Analytics',
    desc: 'Ask ChatGPT about your traffic, top visited dishes, and busiest days. Turn data into high-converting seasonal promotions.'
  },
  {
    icon: 'map-pin',
    title: 'Multi-Location Support',
    desc: 'Easily run multiple venues with dedicated location URLs, unique hours, and location-scoped menu items under one organization.'
  }
] as const

const faqs = [
  {
    q: 'Are there any per-cover or booking fees?',
    a: 'None. KrabiClaw charges zero commission per reservation. Starter is free forever, and Growth is a flat monthly rate regardless of how many guests you seat — see the pricing page for current rates.'
  },
  {
    q: 'How does menu editing work with ChatGPT?',
    a: 'Connect the KrabiClaw MCP app in ChatGPT. You can simply chat: "Add our seafood paella to the specials section for $28" or "Mark the tuna tartare as sold out today".'
  },
  {
    q: 'Can I connect my own custom domain?',
    a: 'Yes. On the Growth plan, you can connect your custom domain (like mybistro.com) with automated global SSL and edge CDN routing.'
  },
  {
    q: 'How does Google Places syncing work?',
    a: 'Connect your Google Maps listing to automatically import your verified hours, street address, photos, and customer reviews. KrabiClaw keeps your website synchronized with Google.'
  },
  {
    q: 'Can I manage multiple restaurant branches?',
    a: 'Yes. KrabiClaw natively supports multi-location businesses like Kikuzuki, allowing separate menus, hours, and addresses while maintaining unified brand identity.'
  },
  {
    q: 'Do I have to discard my current website?',
    a: 'You can build and preview your KrabiClaw restaurant site completely free on a subdomain before pointing your production custom domain when you are ready.'
  }
]

const config = useRuntimeConfig()
const requestURL = useRequestURL()
const siteUrl = config.public.siteUrl || requestURL.origin

useSocialMetadata({
  template: 'platform',
  path: '/restaurants',
  title: 'Restaurant Websites with Zero Booking Fees',
  description: 'Modern restaurant websites with crawlable HTML menus, Google Places sync, and zero-commission table reservations — managed entirely through ChatGPT.',
  schemaPageType: 'ItemPage',
  breadcrumbs: [
    { name: 'Home', url: '/' },
    { name: 'Restaurants', url: '/restaurants' },
  ],
  schemaNodes: [
    {
      '@type': 'Product',
      '@id': `${siteUrl}/restaurants#product`,
      name: 'KrabiClaw for Restaurants',
      description: 'Zero-commission restaurant websites with crawlable HTML menus and Google Places sync, managed via ChatGPT.',
      url: `${siteUrl}/restaurants`,
      category: 'SoftwareApplication',
    },
  ],
  faqItems: faqs.map(f => ({ question: f.q, answer: f.a })),
})
</script>
