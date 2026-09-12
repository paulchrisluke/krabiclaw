<template>
  <div class="relative overflow-hidden py-20 lg:py-28">
    <div class="absolute top-0 left-1/4 -z-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-50"></div>
    <div class="absolute bottom-1/3 right-1/4 -z-10 w-96 h-96 bg-(--kc-teal)/10 rounded-full blur-3xl opacity-40"></div>

    <div class="container mx-auto px-4 max-w-4xl space-y-20">
      <!-- Hero Header -->
      <div class="text-center space-y-4">
        <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
          About KrabiClaw
        </span>
        <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05] text-default m-0 text-balance">
          Websites that independent businesses can actually run.
        </h1>
        <p class="text-lg sm:text-xl text-muted leading-relaxed max-w-2xl mx-auto m-0">
          KrabiClaw replaces complicated agency retainers and aggregator commissions with an AI-managed web operating layer built for ChatGPT.
        </p>
      </div>

      <!-- The Problem We Saw -->
      <div class="rounded-3xl border border-default bg-elevated/40 p-8 sm:p-12 space-y-6 backdrop-blur-md">
        <h2 class="text-2xl sm:text-3xl font-bold text-default m-0">The local business dilemma</h2>
        <p class="text-base text-muted leading-relaxed m-0">
          Local business owners face a bad choice: pay an agency for a static website that grows outdated within weeks, or surrender their customers to aggregators and booking platforms that take a cut of every transaction.
        </p>
        <p class="text-base text-muted leading-relaxed m-0">
          When an owner needs to update holiday hours, rotate a seasonal menu, or post a new workshop slot, they shouldn’t have to battle an intimidating CMS dashboard or wait for an agency invoice. That’s why we built KrabiClaw around a simple premise: <strong>your website should be managed through conversation.</strong>
        </p>
      </div>

      <!-- Three Verticals -->
      <div class="space-y-8">
        <div class="text-center max-w-xl mx-auto">
          <span class="kc-eyebrow text-muted">Focused Solutions</span>
          <h2 class="text-3xl font-bold text-default mt-2">Built for three canonical industries</h2>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          <div class="rounded-2xl border border-default bg-elevated/40 p-6 space-y-3">
            <div class="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <PlatformIcon name="utensils" class="size-5" />
            </div>
            <h3 class="text-lg font-bold text-default m-0">Restaurants</h3>
            <p class="text-sm text-muted leading-relaxed m-0">
              Proven by <strong>Kikuzuki</strong> across two branches. Crawlable HTML menus, real-time Google Places sync, and zero-commission table reservations.
            </p>
          </div>

          <div class="rounded-2xl border border-default bg-elevated/40 p-6 space-y-3">
            <div class="size-10 rounded-xl bg-(--kc-teal)/10 text-(--kc-teal-600) flex items-center justify-center">
              <PlatformIcon name="calendar" class="size-5" />
            </div>
            <h3 class="text-lg font-bold text-default m-0">Experiences</h3>
            <p class="text-sm text-muted leading-relaxed m-0">
              Proven by <strong>Pottery House Krabi</strong>. Time-slot scheduling, capacity management, and direct booking without marketplace cuts.
            </p>
          </div>

          <div class="rounded-2xl border border-default bg-elevated/40 p-6 space-y-3">
            <div class="size-10 rounded-xl bg-(--kc-navy)/10 text-default flex items-center justify-center">
              <PlatformIcon name="briefcase" class="size-5 text-primary" />
            </div>
            <h3 class="text-lg font-bold text-default m-0">Legal & Advisory</h3>
            <p class="text-sm text-muted leading-relaxed m-0">
              Proven by <strong>North Carolina Legal Services</strong> via our Blawby template. Structured practice areas, compliance notices, and consultation intake.
            </p>
          </div>
        </div>
      </div>

      <!-- CTA Section -->
      <div class="rounded-3xl border border-default bg-elevated p-8 sm:p-12 text-center space-y-6 shadow-sm">
        <h2 class="text-3xl font-extrabold text-default m-0">Ready to take control of your web presence?</h2>
        <p class="text-base text-muted max-w-lg mx-auto m-0">
          Start completely free on a subdomain, connect the KrabiClaw app in ChatGPT, and experience website management through conversation.
        </p>
        <div class="flex justify-center gap-4">
          <PlatformAccountCta label="Start Free" size="lg" />
          <PlatformButton to="/features" variant="outline" size="lg">Explore Features</PlatformButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
useSocialMetadata(() => ({
  template: 'platform',
  path: '/about',
  title: 'About',
  description: 'KrabiClaw replaces agency retainers and aggregator commissions with an AI-managed web operating layer for local businesses, built for ChatGPT.',
  breadcrumbs: [{ name: 'Home', url: '/' }, { name: 'About', url: '/about' }],
}))
</script>
