<template>
    <div class="relative overflow-hidden py-16 sm:py-24">
    <!-- Ambient Background Mesh -->
    <div class="absolute top-0 right-1/4 -z-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-60"></div>
    <div class="absolute bottom-1/3 left-1/4 -z-10 w-112.5 h-112.5 bg-(--kc-teal)/10 rounded-full blur-3xl opacity-50"></div>

    <div class="container mx-auto px-4 max-w-7xl">
      <!-- ── 1. Hero Section ────────────────────────────────────────── -->
      <div class="text-center max-w-3xl mx-auto mb-20 flex flex-col items-center gap-6">
        <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-(--kc-teal)/10 text-(--kc-teal-600) border border-(--kc-teal)/20">
          <PlatformIcon name="calendar" class="size-3.5" />
          Experiences & Activities
        </span>
        <h1 class="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05] text-default m-0 text-balance">
          Stop losing every booking to marketplaces. <br class="hidden sm:inline" />
          <span class="bg-gradient-to-r from-(--kc-teal) via-(--kc-coral) to-primary bg-clip-text text-transparent">
            Direct bookings & ticketing, managed in ChatGPT.
          </span>
        </h1>
        <p class="text-lg sm:text-xl text-muted leading-relaxed m-0 text-balance">
          High-converting booking pages for pottery workshops, tours, cooking classes, and studios. Time-slot scheduling, capacity control, and zero booking commissions.
        </p>
        <div class="flex flex-wrap items-center justify-center gap-4 mt-2">
          <PlatformAccountCta label="Start Free for Experiences" size="lg" class="shadow-sm transition-transform hover:-translate-y-0.5" />
          <PlatformButton to="/pricing" variant="outline" size="lg" class="transition-transform hover:-translate-y-0.5">
            View Pricing
          </PlatformButton>
        </div>
      </div>

      <!-- ── 2. Marketplace Cuts vs Direct Bookings ─────────────────── -->
      <div class="grid md:grid-cols-2 gap-8 mb-24 max-w-5xl mx-auto">
        <!-- The Marketplace Middleman -->
        <div class="rounded-3xl border border-default/60 bg-elevated/30 p-8 flex flex-col justify-between">
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-red-500/10 text-red-500 mb-6 border border-red-500/20">
              <PlatformIcon name="x" class="size-3.5" />
              The OTA & Marketplace Trap
            </div>
            <h3 class="text-2xl font-bold text-default mb-4">Why third-party ticketing platforms hurt studios</h3>
            <ul class="space-y-4 p-0 list-none text-sm text-muted">
              <li class="flex items-start gap-3">
                <span class="size-5 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✕</span>
                <span><strong>Commission Cuts:</strong> Viator, GetYourGuide, and Airbnb Experiences take a share of every booking they send you.</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="size-5 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✕</span>
                <span><strong>Held Hostage Customer Data:</strong> Marketplaces hide guest emails and phone numbers, preventing repeat bookings or direct community marketing.</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="size-5 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✕</span>
                <span><strong>Clunky Iframe Widgets:</strong> Embedding third-party widgets on generic websites breaks mobile layouts and slows page loads.</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="size-5 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✕</span>
                <span><strong>Manual DM Coordination:</strong> Handling capacity adjustments, group inquiries, and schedule changes through Instagram DMs leads to overbooking.</span>
              </li>
            </ul>
          </div>
        </div>

        <!-- The KrabiClaw Way -->
        <div class="rounded-3xl border border-(--kc-teal)/40 bg-elevated/80 p-8 flex flex-col justify-between relative shadow-xl shadow-(--kc-teal)/5">
          <div class="absolute top-0 right-0 w-32 h-32 bg-(--kc-teal)/10 rounded-bl-full pointer-events-none"></div>
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-(--kc-teal)/15 text-(--kc-teal-600) mb-6 border border-(--kc-teal)/25">
              <PlatformIcon name="check" class="size-3.5" />
              Direct Studio Ownership
            </div>
            <h3 class="text-2xl font-bold text-default mb-4">Direct ticket sales. Zero commissions.</h3>
            <ul class="space-y-4 p-0 list-none text-sm text-default/90">
              <li class="flex items-start gap-3">
                <PlatformIcon name="check-circle" class="size-5 text-(--kc-teal) shrink-0 mt-0.5" />
                <span><strong>Keep 100% of Ticket Revenue:</strong> Flat monthly pricing with zero ticketing commissions or per-booking surcharges.</span>
              </li>
              <li class="flex items-start gap-3">
                <PlatformIcon name="check-circle" class="size-5 text-(--kc-teal) shrink-0 mt-0.5" />
                <span><strong>Automated Capacity & Time Slots:</strong> Set seat maximums, durations, and session times that automatically prevent overbooking.</span>
              </li>
              <li class="flex items-start gap-3">
                <PlatformIcon name="check-circle" class="size-5 text-(--kc-teal) shrink-0 mt-0.5" />
                <span><strong>Own Your Guest Relationships:</strong> Direct WhatsApp and email confirmations keep guests informed and build loyal relationships.</span>
              </li>
              <li class="flex items-start gap-3">
                <PlatformIcon name="check-circle" class="size-5 text-(--kc-teal) shrink-0 mt-0.5" />
                <span><strong>Edit in ChatGPT:</strong> Tell ChatGPT <em>"Add an afternoon wheel-throwing workshop on Saturdays for 8 people"</em> and it’s live.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- ── 3. Conversational Workflows Teardown ────────────────────── -->
      <div class="rounded-3xl border border-default bg-elevated/40 p-8 sm:p-12 mb-24 max-w-5xl mx-auto backdrop-blur-md">
        <div class="text-center max-w-2xl mx-auto mb-10">
          <span class="kc-eyebrow text-(--kc-teal-600)">Conversational Studio Operations</span>
          <h2 class="text-3xl font-bold text-default mt-2">Manage sessions & bookings by talking to ChatGPT</h2>
          <p class="text-sm text-muted mt-2">Update time slots, check booking demand, and publish promotions without touching code.</p>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          <!-- Workflow 1 -->
          <div class="rounded-2xl border border-default bg-default p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div class="flex items-center gap-2 mb-4 text-xs font-bold uppercase text-(--kc-teal)">
                <PlatformIcon name="calendar" class="size-4" />
                Schedule & Capacity
              </div>
              <div class="rounded-xl bg-muted/40 p-3 text-xs font-mono text-muted mb-4 border border-default/50">
                “Add a 2-hour beginner ceramics session every Sunday at 10 AM, max 6 students, 1,200 THB.”
              </div>
              <p class="text-[13px] text-muted leading-relaxed m-0">
                ChatGPT configures duration, capacity controls, and pricing, generating an SEO-rich booking page instantly.
              </p>
            </div>
          </div>

          <!-- Workflow 2 -->
          <div class="rounded-2xl border border-default bg-default p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div class="flex items-center gap-2 mb-4 text-xs font-bold uppercase text-primary">
                <PlatformIcon name="bar-chart" class="size-4" />
                Booking Analytics
              </div>
              <div class="rounded-xl bg-muted/40 p-3 text-xs font-mono text-muted mb-4 border border-default/50">
                “Which of our workshop sessions got the most booking inquiries this month, and what is our overall conversion rate?”
              </div>
              <p class="text-[13px] text-muted leading-relaxed m-0">
                Instantly inspects your conversion events and booking ledger to tell you what classes are in highest demand.
              </p>
            </div>
          </div>

          <!-- Workflow 3 -->
          <div class="rounded-2xl border border-default bg-default p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div class="flex items-center gap-2 mb-4 text-xs font-bold uppercase text-(--kc-coral)">
                <PlatformIcon name="sparkles" class="size-4" />
                Group Inquiries
              </div>
              <div class="rounded-xl bg-muted/40 p-3 text-xs font-mono text-muted mb-4 border border-default/50">
                “Show me pending private event inquiries and draft a confirmation email for a company team-building session.”
              </div>
              <p class="text-[13px] text-muted leading-relaxed m-0">
                Review inquiries in your unified inbox and draft customized replies without leaving the chat conversation.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 4. Verified Client Proof: Pottery House Krabi ──────────── -->
      <div class="relative rounded-[28px] overflow-hidden border border-default p-8 sm:p-12 mb-24 bg-(--kc-navy) text-white shadow-2xl">
        <div class="absolute -bottom-32 -left-32 w-80 h-80 bg-(--kc-teal)/20 rounded-full blur-3xl opacity-80"></div>
        <div class="relative z-10 grid lg:grid-cols-12 gap-8 items-center">
          <div class="lg:col-span-7 space-y-6">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-white/10 text-white/90 border border-white/20">
              <PlatformIcon name="sparkles" class="size-3.5 text-(--kc-coral)" />
              Verified Production Showcase
            </span>
            <h2 class="text-3xl sm:text-4xl font-bold tracking-tight text-white m-0">
              How Pottery House Krabi powers hands-on workshops
            </h2>
            <p class="text-white/80 text-[15px] sm:text-base leading-relaxed m-0">
              Pottery House Krabi offers daily wheel-throwing classes, hand-building workshops, and private group experiences across their <strong>main studio</strong> and <strong>beachfront space</strong>. With KrabiClaw, visitors book time slots directly from their phones with real-time capacity safeguards and automated WhatsApp confirmations.
            </p>
            <div class="grid sm:grid-cols-3 gap-4 pt-2">
              <div class="rounded-xl bg-white/5 border border-white/10 p-4">
                <div class="text-2xl font-black text-(--kc-teal)">0%</div>
                <div class="text-xs text-white/70 mt-0.5">Marketplace Fees</div>
              </div>
              <div class="rounded-xl bg-white/5 border border-white/10 p-4">
                <div class="text-2xl font-black text-white">2</div>
                <div class="text-xs text-white/70 mt-0.5">Studio Branches</div>
              </div>
              <div class="rounded-xl bg-white/5 border border-white/10 p-4">
                <div class="text-2xl font-black text-(--kc-coral)">Real-Time</div>
                <div class="text-xs text-white/70 mt-0.5">Capacity Control</div>
              </div>
            </div>
          </div>
          <div class="lg:col-span-5 flex justify-center">
            <div class="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur-md shadow-xl w-full max-w-sm space-y-4">
              <div class="flex items-center justify-between border-b border-white/10 pb-4">
                <div class="font-bold text-white text-base">Pottery House Krabi</div>
                <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary">Saya Theme</span>
              </div>
              <div class="space-y-2 text-xs text-white/80">
                <div class="flex justify-between py-1 border-b border-white/5">
                  <span class="text-white/60">Wheel Throwing (2h)</span>
                  <span>Slots: 10:00, 14:00, 16:30</span>
                </div>
                <div class="flex justify-between py-1 border-b border-white/5">
                  <span class="text-white/60">Capacity per session</span>
                  <span>Max 6 participants</span>
                </div>
                <div class="flex justify-between py-1 border-b border-white/5">
                  <span class="text-white/60">Private Groups</span>
                  <span>Inquiry & custom quotes</span>
                </div>
              </div>
              <div class="pt-2">
                <PlatformButton to="/templates/saya" variant="outline" size="sm" class="w-full text-white border-white/30 hover:bg-white/10 justify-center">
                  Explore Experience Theme →
                </PlatformButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 5. Features Grid ───────────────────────────────────────── -->
      <div class="max-w-6xl mx-auto mb-24">
        <div class="text-center max-w-2xl mx-auto mb-14">
          <span class="kc-eyebrow text-muted">Tailored for Activities</span>
          <h2 class="text-3xl sm:text-4xl font-bold text-default mt-2">Everything you need to run ticketed classes and tours</h2>
        </div>
        <div class="grid md:grid-cols-3 gap-6">
          <div
            v-for="feat in experienceFeatures"
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
        <h2 class="text-3xl font-bold text-default text-center mb-12">Frequently Asked Experience Questions</h2>
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
        <h2 class="text-3xl sm:text-4xl font-bold text-default m-0">Start selling workshop tickets directly</h2>
        <p class="text-base sm:text-lg text-muted max-w-xl m-0 leading-relaxed">
          Create your experience site in minutes, connect with ChatGPT, and accept commission-free bookings today.
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
</template>

<script setup lang="ts">
const experienceFeatures = [
  {
    icon: 'calendar',
    title: 'Time-Slot & Capacity Engine',
    desc: 'Define session start times, durations, and participant limits. Slots close automatically when capacity is reached.'
  },
  {
    icon: 'image',
    title: 'High-Impact Galleries',
    desc: 'Showcase photos and video of past workshop creations, studio spaces, and guest testimonials with fast edge delivery.'
  },
  {
    icon: 'message-circle',
    title: 'Direct WhatsApp Confirmations',
    desc: 'Notify guests instantly when their booking is confirmed, keeping communication fast and personal.'
  },
  {
    icon: 'inbox',
    title: 'Group & Private Event Inquiries',
    desc: 'Capture inquiries for corporate retreats, private parties, and custom workshops that require special pricing.'
  },
  {
    icon: 'bar-chart',
    title: 'Demand Analytics in ChatGPT',
    desc: 'Ask ChatGPT "which time slot fills fastest?" or "how many people looked at our weekend workshop?" for clear operating insights.'
  },
  {
    icon: 'globe',
    title: 'Local SEO & Schema.org',
    desc: 'Automated Event and LocalBusiness schema markup ensures your activities rank in Google Search and AI answer engines.'
  }
] as const

const faqs = [
  {
    q: 'Do you charge booking or ticket commissions?',
    a: 'Zero commissions. You keep 100% of your ticket price. KrabiClaw is flat-rate: Starter is free, Growth is a fixed monthly fee. See the pricing page for current rates.'
  },
  {
    q: 'Can I set maximum group sizes per class?',
    a: 'Yes. Each experience has customizable capacity limits per time slot. Once a session fills up, it is automatically marked as unavailable.'
  },
  {
    q: 'How do customers receive their confirmations?',
    a: 'Guests receive automated confirmation emails on Starter, and automated WhatsApp messages on Growth.'
  },
  {
    q: 'Can I handle custom group pricing before booking?',
    a: 'Yes. KrabiClaw includes an inquiry-only flow for private events, school groups, and corporate workshops that need custom quotes.'
  },
  {
    q: 'How do I add a new class or workshop?',
    a: 'You can create and edit experiences either through the dashboard or by simply asking ChatGPT: "Create a 2-hour macrame class on Saturdays for $35 with 8 spots".'
  },
  {
    q: 'Can I connect my Google Business Profile?',
    a: 'Yes. On the Growth plan, your studio address, hours, ratings, and verified reviews automatically sync directly from Google Places.'
  }
]

const config = useRuntimeConfig()
const requestURL = useRequestURL()
const siteUrl = config.public.siteUrl || requestURL.origin

useSocialMetadata({
  template: 'platform',
  path: '/experiences',
  title: 'Experience & Workshop Booking Websites',
  description: 'Direct booking websites for pottery classes, tours, studios, and workshops. Time-slot scheduling, capacity control, and zero booking commissions.',
  schemaPageType: 'ItemPage',
  breadcrumbs: [
    { name: 'Home', url: '/' },
    { name: 'Experiences', url: '/experiences' },
  ],
  schemaNodes: [
    {
      '@type': 'Product',
      '@id': `${siteUrl}/experiences#product`,
      name: 'KrabiClaw for Experiences',
      description: 'Direct booking and ticketing websites for workshops, studios, and tours with zero booking fees, managed via ChatGPT.',
      url: `${siteUrl}/experiences`,
      category: 'SoftwareApplication',
    },
  ],
  faqItems: faqs.map(f => ({ question: f.q, answer: f.a })),
})
</script>
