<template>
  <NuxtLayout name="platform">
    <div v-if="isPlatform" class="relative overflow-hidden py-16 sm:py-24">
    <!-- Ambient Background Mesh -->
    <div class="absolute top-0 left-1/4 -z-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-60"></div>
    <div class="absolute bottom-1/3 right-1/4 -z-10 w-112.5 h-112.5 bg-(--kc-navy)/10 rounded-full blur-3xl opacity-50"></div>

    <div class="container mx-auto px-4 max-w-7xl">
      <!-- ── 1. Hero Section ────────────────────────────────────────── -->
      <div class="text-center max-w-3xl mx-auto mb-20 flex flex-col items-center gap-6">
        <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-(--kc-navy)/10 text-default border border-default/30">
          <PlatformIcon name="briefcase" class="size-3.5 text-primary" />
          Blawby for Professional Services
        </span>
        <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05] text-default m-0 text-balance">
          Modern law practice websites. <br class="hidden sm:inline" />
          <span class="bg-gradient-to-r from-primary via-(--kc-navy-700) to-(--kc-teal) bg-clip-text text-transparent">
            Structured practice areas, managed in ChatGPT.
          </span>
        </h1>
        <p class="text-lg sm:text-xl text-muted leading-relaxed m-0 text-balance">
          Dedicated practice area URLs, consultation booking flows, regulatory compliance pages, and canonical LegalService structured data — without the agency retainer.
        </p>
        <div class="flex flex-wrap items-center justify-center gap-4 mt-2">
          <PlatformAccountCta label="Get Started with Blawby" size="lg" class="shadow-sm transition-transform hover:-translate-y-0.5" />
          <PlatformButton to="/templates/blawby" variant="outline" size="lg" class="transition-transform hover:-translate-y-0.5">
            Explore Template
          </PlatformButton>
        </div>
      </div>

      <!-- ── 2. The Agency Trap vs Blawby ───────────────────────────── -->
      <div class="grid md:grid-cols-2 gap-8 mb-24 max-w-5xl mx-auto">
        <!-- The Outdated Agency Way -->
        <div class="rounded-3xl border border-default/60 bg-elevated/30 p-8 flex flex-col justify-between">
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-red-500/10 text-red-500 mb-6 border border-red-500/20">
              <PlatformIcon name="x" class="size-3.5" />
              The Agency Retainer Model
            </div>
            <h3 class="text-2xl font-bold text-default mb-4">Why traditional legal websites fall behind</h3>
            <ul class="space-y-4 p-0 list-none text-sm text-muted">
              <li class="flex items-start gap-3">
                <span class="size-5 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✕</span>
                <span><strong>High Ongoing Costs:</strong> Boutique agencies charge a large upfront build fee plus a monthly maintenance retainer, for static pages.</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="size-5 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✕</span>
                <span><strong>Unstructured Practice Areas:</strong> Cramming practice expertise into generic blog posts hurts SEO authority and search crawler discovery.</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="size-5 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✕</span>
                <span><strong>Missing Compliance & Schema:</strong> Missing bar admission details, nonprofit 501(c)(3) designations, or required legal disclaimers.</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="size-5 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✕</span>
                <span><strong>Friction-Filled Intake:</strong> Clunky static contact forms that fail to route prospective clients to consultation calendars.</span>
              </li>
            </ul>
          </div>
        </div>

        <!-- The Blawby Way -->
        <div class="rounded-3xl border border-primary/30 bg-elevated/80 p-8 flex flex-col justify-between relative shadow-xl shadow-primary/5">
          <div class="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-bl-full pointer-events-none"></div>
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-primary/15 text-primary mb-6 border border-primary/25">
              <PlatformIcon name="check" class="size-3.5" />
              The Blawby Architecture
            </div>
            <h3 class="text-2xl font-bold text-default mb-4">Credible. Compliant. Fast.</h3>
            <ul class="space-y-4 p-0 list-none text-sm text-default/90">
              <li class="flex items-start gap-3">
                <PlatformIcon name="check-circle" class="size-5 text-(--kc-teal) shrink-0 mt-0.5" />
                <span><strong>Dedicated Practice Area Architecture:</strong> Canonical <code>/services/[slug]</code> routes optimized for local search authority.</span>
              </li>
              <li class="flex items-start gap-3">
                <PlatformIcon name="check-circle" class="size-5 text-(--kc-teal) shrink-0 mt-0.5" />
                <span><strong>Consultation Scheduling Handoffs:</strong> Seamlessly integrate Clio Grow, Calendly, or native contact intake flows.</span>
              </li>
              <li class="flex items-start gap-3">
                <PlatformIcon name="check-circle" class="size-5 text-(--kc-teal) shrink-0 mt-0.5" />
                <span><strong>Canonical LegalService Schema:</strong> Verified schema.org linked <code>@graph</code> supporting legal aid, nonprofit status, and bar service areas.</span>
              </li>
              <li class="flex items-start gap-3">
                <PlatformIcon name="check-circle" class="size-5 text-(--kc-teal) shrink-0 mt-0.5" />
                <span><strong>Update via ChatGPT:</strong> Publish legal updates, firm announcements, and practice area guides directly through conversation.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- ── 3. Conversational Workflows Teardown ────────────────────── -->
      <div class="rounded-3xl border border-default bg-elevated/40 p-8 sm:p-12 mb-24 max-w-5xl mx-auto backdrop-blur-md">
        <div class="text-center max-w-2xl mx-auto mb-10">
          <span class="kc-eyebrow text-primary">Practice Management</span>
          <h2 class="text-3xl font-extrabold text-default mt-2">Managing your legal presence with ChatGPT</h2>
          <p class="text-sm text-muted mt-2">Publish guidance, update practice areas, and inspect inquiry trends seamlessly.</p>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          <!-- Workflow 1 -->
          <div class="rounded-2xl border border-default bg-default p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div class="flex items-center gap-2 mb-4 text-xs font-bold uppercase text-primary">
                <PlatformIcon name="briefcase" class="size-4" />
                Practice Area Updates
              </div>
              <div class="rounded-xl bg-muted/40 p-3 text-xs font-mono text-muted mb-4 border border-default/50">
                “Add an estate planning offering page outlining our trust administration and power-of-attorney services.”
              </div>
              <p class="text-[13px] text-muted leading-relaxed m-0">
                ChatGPT generates the dedicated page with legal structured data, clean headings, and a consultation CTA.
              </p>
            </div>
          </div>

          <!-- Workflow 2 -->
          <div class="rounded-2xl border border-default bg-default p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div class="flex items-center gap-2 mb-4 text-xs font-bold uppercase text-(--kc-teal)">
                <PlatformIcon name="file-text" class="size-4" />
                Thought Leadership
              </div>
              <div class="rounded-xl bg-muted/40 p-3 text-xs font-mono text-muted mb-4 border border-default/50">
                “Draft and publish a guidance article on recent statutory changes to state tenant eviction protections.”
              </div>
              <p class="text-[13px] text-muted leading-relaxed m-0">
                Creates an editorial article under <code>/article/[slug]</code> with automatic openGraph and author credentials.
              </p>
            </div>
          </div>

          <!-- Workflow 3 -->
          <div class="rounded-2xl border border-default bg-default p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div class="flex items-center gap-2 mb-4 text-xs font-bold uppercase text-(--kc-coral)">
                <PlatformIcon name="inbox" class="size-4" />
                Intake & Inquiries
              </div>
              <div class="rounded-xl bg-muted/40 p-3 text-xs font-mono text-muted mb-4 border border-default/50">
                “How many prospective clients submitted consultation inquiries this month, and what practice areas were requested?”
              </div>
              <p class="text-[13px] text-muted leading-relaxed m-0">
                Inspects your secure first-party inquiry ledger to identify high-demand service areas without third-party tracking cookies.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 4. Verified Client Proof: NCLS ─────────────────────────── -->
      <div class="relative rounded-[28px] overflow-hidden border border-default p-8 sm:p-12 mb-24 bg-(--kc-navy) text-white shadow-2xl">
        <div class="absolute -top-32 -right-32 w-80 h-80 bg-primary/20 rounded-full blur-3xl opacity-80"></div>
        <div class="relative z-10 grid lg:grid-cols-12 gap-8 items-center">
          <div class="lg:col-span-7 space-y-6">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-white/10 text-white/90 border border-white/20">
              <PlatformIcon name="shield-check" class="size-3.5 text-(--kc-teal)" />
              Verified Production Showcase
            </span>
            <h2 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-white m-0">
              North Carolina Legal Services (NCLS)
            </h2>
            <p class="text-white/80 text-[15px] sm:text-base leading-relaxed m-0">
              NCLS provides statewide legal aid and representation for families, consumers, and homeowners across North Carolina. Using KrabiClaw's Blawby template, NCLS delivers clean practice area navigation, disaster relief legal guides, accessibility-compliant reading modes, and external consultation intake through Clio Grow.
            </p>
            <div class="grid sm:grid-cols-3 gap-4 pt-2">
              <div class="rounded-xl bg-white/5 border border-white/10 p-4">
                <div class="text-2xl font-black text-white">Statewide</div>
                <div class="text-xs text-white/70 mt-0.5">Service Area Coverage</div>
              </div>
              <div class="rounded-xl bg-white/5 border border-white/10 p-4">
                <div class="text-2xl font-black text-(--kc-teal)">501(c)(3)</div>
                <div class="text-xs text-white/70 mt-0.5">Verified Nonprofit Schema</div>
              </div>
              <div class="rounded-xl bg-white/5 border border-white/10 p-4">
                <div class="text-2xl font-black text-(--kc-coral)">Clio Grow</div>
                <div class="text-xs text-white/70 mt-0.5">Consultation Intake Handoff</div>
              </div>
            </div>
          </div>
          <div class="lg:col-span-5 flex justify-center">
            <div class="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur-md shadow-xl w-full max-w-sm space-y-4">
              <div class="flex items-center justify-between border-b border-white/10 pb-4">
                <div class="font-bold text-white text-base">North Carolina Legal Services</div>
                <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-(--kc-teal)/20 text-(--kc-teal)">Blawby Theme</span>
              </div>
              <div class="space-y-2 text-xs text-white/80">
                <div class="flex justify-between py-1 border-b border-white/5">
                  <span class="text-white/60">Practice Areas</span>
                  <span>Family, Housing, Education, Consumer</span>
                </div>
                <div class="flex justify-between py-1 border-b border-white/5">
                  <span class="text-white/60">Legal Articles</span>
                  <span>Eviction Defense, IEP Rights, Helene Relief</span>
                </div>
                <div class="flex justify-between py-1 border-b border-white/5">
                  <span class="text-white/60">Intake System</span>
                  <span class="text-(--kc-teal) font-semibold">Verified Online Intake</span>
                </div>
              </div>
              <div class="pt-2">
                <PlatformButton to="/templates/blawby" variant="outline" size="sm" class="w-full text-white border-white/30 hover:bg-white/10 justify-center">
                  Explore Blawby Template →
                </PlatformButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 5. Features Grid ───────────────────────────────────────── -->
      <div class="max-w-6xl mx-auto mb-24">
        <div class="text-center max-w-2xl mx-auto mb-14">
          <span class="kc-eyebrow text-muted">Legal Practice Essentials</span>
          <h2 class="text-3xl sm:text-4xl font-extrabold text-default mt-2">Built for professional practices that demand credibility</h2>
        </div>
        <div class="grid md:grid-cols-3 gap-6">
          <div
            v-for="feat in legalFeatures"
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
        <h2 class="text-3xl font-extrabold text-default text-center mb-12">Frequently Asked Legal Practice Questions</h2>
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
        <h2 class="text-3xl sm:text-4xl font-extrabold text-default m-0">Build your professional practice site</h2>
        <p class="text-base sm:text-lg text-muted max-w-xl m-0 leading-relaxed">
          Launch a high-authority legal site powered by the Blawby template and manage updates seamlessly in ChatGPT.
        </p>
        <div class="flex flex-wrap gap-4">
          <PlatformAccountCta label="Get Started" size="lg" class="shadow-sm" />
          <PlatformButton to="/pricing" variant="outline" size="lg">
            View Pricing
          </PlatformButton>
        </div>
      </div>
    </div>
    </div>
    <TenantPublicPage v-else path="/legal" />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const { isPlatform } = useTenantSite()

const legalFeatures = [
  {
    icon: 'briefcase',
    title: 'Practice Area / Offering Pages',
    desc: 'Dedicated URLs for every area of legal expertise with structured headings, sub-offerings, and inquiry routing.'
  },
  {
    icon: 'calendar',
    title: 'Consultation Intake Routing',
    desc: 'Connect prospective clients directly to Clio Grow, Calendly, or our native contact workflow with short-lived intake continuity.'
  },
  {
    icon: 'file-text',
    title: 'Canonical Article Publishing',
    desc: 'Publish timely statutory updates and thought leadership under canonical /article/[slug] routes to build permanent SEO equity.'
  },
  {
    icon: 'shield-check',
    title: 'Out-of-the-Box Legal Compliance',
    desc: 'Pre-configured templates for attorney advertising disclaimers, state bar notices, privacy policies, and terms of service.'
  },
  {
    icon: 'globe',
    title: 'Schema.org LegalService Graph',
    desc: 'Automated linked graphs specifying LegalService, Nonprofit501c3 status, and geographic service areas without pasting raw JSON-LD.'
  },
  {
    icon: 'inbox',
    title: 'Private Intake Inbox',
    desc: 'Manage prospective client inquiries securely from your dashboard without sharing lead data with third-party aggregators.'
  }
] as const

const faqs = [
  {
    q: 'Which KrabiClaw plan includes the Blawby template?',
    a: 'Blawby is included on the Growth plan, alongside your custom domain, SSL, and full access to professional-service features. See the pricing page for current rates.'
  },
  {
    q: 'Can I connect my practice management software like Clio?',
    a: 'Yes. Blawby natively supports consultation routing to external scheduling links like Clio Grow or Calendly, or native intake forms.'
  },
  {
    q: 'Do professional-service firms require physical storefront addresses?',
    a: 'No. Blawby is designed for statewide and remote service-area practices as well as physical offices. Address visibility is fully controllable in your compliance settings.'
  },
  {
    q: 'How does legal article publishing work?',
    a: 'You can draft, schedule, and publish long-form guidance articles under /blog and /article/[slug] directly through conversation with ChatGPT.'
  },
  {
    q: 'Is our website compliant with schema.org standards?',
    a: 'Yes. KrabiClaw emits a verified LegalService linked @graph with canonical IDs, nonprofit designations, and service areas.'
  },
  {
    q: 'Can I map our existing firm domain name?',
    a: 'Yes. Growth includes automated SSL certificates and global Cloudflare edge distribution for your custom domain (e.g. yourfirm.com).'
  }
]

const config = useRuntimeConfig()
const requestURL = useRequestURL()
const siteUrl = config.public.siteUrl || requestURL.origin

useSocialMetadata({
  template: 'platform',
  path: '/legal',
  title: 'Law Practice & Legal Services Websites',
  description: 'Modern websites for law firms, solo practitioners, and legal aid societies. Dedicated practice areas, consultation intake, and canonical schema.org LegalService graphs.',
  schemaPageType: 'ItemPage',
  breadcrumbs: [
    { name: 'Home', url: '/' },
    { name: 'Legal Services', url: '/legal' },
  ],
  schemaNodes: [
    {
      '@type': 'LegalService',
      '@id': `${siteUrl}/legal#service`,
      name: 'KrabiClaw for Legal Services',
      description: 'Modern law practice websites with structured practice areas, consultation intake flows, and canonical schema.org LegalService graphs.',
      url: `${siteUrl}/legal`,
    },
  ],
  faqItems: faqs.map(f => ({ question: f.q, answer: f.a })),
})
</script>
