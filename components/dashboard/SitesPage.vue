<template>
  <UDashboardPanel id="org-overview">
    <template #header>
      <UDashboardNavbar title="Sites">
        <template #right>
          <UButton
            v-if="canManageOrganization"
            :to="`/dashboard/${orgSlug}/sites/new`"
            icon="i-lucide-plus"
            color="neutral"
            variant="soft"
            square
            aria-label="Add a site"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!--
        The skeleton uses the selector's own grid and card ratio. When it had its
        own column rule and aspect, the page visibly jumped the moment the sites
        loaded — a placeholder that does not reserve the real space is worse than
        none.
      -->
      <div v-if="pending" class="space-y-6">
        <USkeleton class="h-9 w-40 rounded-lg" />
        <div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-6">
          <USkeleton v-for="i in 2" :key="i" class="aspect-[20/19] rounded-2xl" />
        </div>
      </div>

      <div v-else class="space-y-8">
        <!-- Discard acts on the caller's own draft, so without that lookup the
             page does not know which tile the control belongs to. It says so
             rather than leaving the control silently missing. -->
        <UAlert
          v-if="draftLookupError"
          color="error"
          variant="soft"
          title="Could not check your unfinished site"
          :description="draftLookupError"
        />

        <div v-if="sites.length === 0" class="rounded-2xl border border-default bg-elevated px-6 py-20 text-center">
          <div class="mx-auto flex size-14 items-center justify-center rounded-full bg-muted">
            <UIcon name="i-lucide-globe" class="size-6 text-muted" />
          </div>
          <h2 class="mt-5 text-base font-semibold text-highlighted">No sites available</h2>
          <p class="mt-2 text-sm text-muted">Your organization’s sites will appear here.</p>
          <UButton
            v-if="canManageOrganization"
            label="Add your first site"
            icon="i-lucide-plus"
            class="mt-6"
            :to="`/dashboard/${orgSlug}/sites/new`"
          />
        </div>

        <DashboardSiteLocationSelector
          v-else
          :items="selectorItems"
        />
      </div>
    </template>
  </UDashboardPanel>

  <!--
    The refusal is shown here rather than as a toast: the endpoint refuses a
    site that has gone live, a caller who is not its owner, and a delete that
    left the site standing, and the owner needs to read that where they pressed
    the button. The dialog stays open and the tile is untouched on every
    refusal; it closes and the hub reloads only once the rows are actually gone.
  -->
  <UModal
    v-model:open="discardOpen"
    title="Discard this unfinished site?"
    :description="discardDescription"
  >
    <template #body>
      <UAlert
        v-if="discardError"
        color="error"
        variant="soft"
        :description="discardError"
      />
      <p v-else class="text-sm text-muted">
        Its draft answers, its address and everything set up so far are deleted. This cannot be undone.
      </p>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Keep it"
          :disabled="draft.busy.value"
          @click="discardOpen = false"
        />
        <UButton
          color="error"
          label="Discard site"
          :loading="draft.busy.value"
          @click="confirmDiscard"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import DashboardSiteLocationSelector, { type SiteLocationSelectorItem } from '~/components/dashboard/SiteLocationSelector.vue'
import { useOnboardingDraft } from '~/composables/useOnboardingDraft'
import { tenantSiteOrigin } from '~/utils/tenant-site-origin'

useSeoMeta({ title: 'Your sites | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const config = useRuntimeConfig()
const orgSlug = computed(() => String(route.params.orgSlug || ''))
const dashboard = useDashboardSite()
const draft = useOnboardingDraft()
const pending = dashboard.pending

const sites = computed(() => dashboard.sites.value)
type Site = (typeof sites.value)[number]
const canManageOrganization = computed(() => ['owner', 'admin'].includes(dashboard.organization.value?.role ?? ''))

// The pending site the caller's own onboarding draft owns, if any. Discard is
// offered on that site and on no other: the endpoint acts on the caller's
// draft rather than on a site id, so offering it on a pending site belonging to
// someone else's draft would delete the caller's draft somewhere else.
const discardableSiteId = ref<string | null>(null)
const draftLookupError = ref<string | null>(null)
const discardSite = ref<Site | null>(null)
const discardOpen = ref(false)
const discardError = ref<string | null>(null)
const discardDescription = computed(() => discardSite.value
  ? `${siteLabel(discardSite.value)} is still in setup and was never published.`
  : '')

/**
 * A site has no photograph of itself, so its tile shows its logo, centred
 * rather than cropped. The generated social card cannot serve here: its name
 * and description are composed into a 1200x630 frame, and the tile crops to
 * near square, which cut the words off at both edges.
 */
const selectorItems = computed<SiteLocationSelectorItem[]>(() => sites.value.map(site => ({
  id: site.id,
  label: siteLabel(site),
  imageUrl: site.media?.find(item => item.slot === 'logo')?.public_url ?? null,
  imageFit: 'contain' as const,
  eyebrow: verticalLabel(site.vertical),
  summary: addressSummary(site),
  // The tile renders the site's logo, not its social card, so the default
  // copy ("No social image / Its social card has not been generated") named
  // the wrong asset on every site without a logo.
  missingImageLabel: 'No logo',
  missingImageHint: 'Add a logo in site settings.',
  status: statusPill(site.onboarding_status),
  actions: discardActions(site),
  to: siteDashboardPath(site),
})))

/**
 * A site is named by its brand name and nothing else. The old chain fell
 * through to the subdomain and then to the row id, so a site missing its brand
 * name was listed under a UUID. It cannot render at all in that state —
 * tenant resolution refuses a site with no brand name — so the hub names the
 * absence instead of showing something that looks like a name.
 */
function siteLabel(site: Site) {
  return site.brand_name ?? 'Unnamed site'
}

function verticalLabel(vertical: Site['vertical']) {
  if (vertical === 'restaurant') return 'Restaurant'
  if (vertical === 'experience') return 'Experiences'
  if (vertical === 'service') return 'Professional services'
  return 'Website'
}

/**
 * A site that has not finished onboarding wears a pill, the way an in-progress
 * listing sits in the same grid as the published ones. Read from
 * `onboarding_status`, never inferred from a missing subdomain: onboarding's
 * first save assigns the subdomain, so every pending site has one.
 */
function statusPill(status: string | null): SiteLocationSelectorItem['status'] {
  if (status === 'active') return undefined
  if (status === 'pending') return { label: 'Setup in progress', color: 'warning' }
  if (status === 'failed') return { label: 'Setup incomplete', color: 'error' }
  // Not one of the three states the routing middleware knows. Say what the
  // column actually holds rather than presenting the site as live.
  return { label: `Unknown status: ${status ?? 'none'}`, color: 'error' }
}

/**
 * The address the tile claims. Only an active site has one: a pending site's
 * subdomain is reserved, not reachable — the tenant host redirects it to the
 * setup page for everyone but its owner — so advertising it as a working domain
 * is the tile telling the owner their site is live when it is not.
 *
 * Built from the free-site domain rather than a hardcoded `krabiclaw.com`,
 * because preview and staging address a tenant as `<sub>-preview.krabiclaw.com`
 * and local development as `<sub>.localhost:3001`.
 */
function addressSummary(site: Site) {
  if (site.onboarding_status !== 'active') return 'Not published yet'
  if (!site.subdomain) return 'No address'
  const origin = tenantSiteOrigin({
    platformDomain: String(config.public.platformDomain),
    freeSiteDomain: String(config.public.freeSiteDomain),
    subdomain: site.subdomain,
  })
  return origin ? origin.replace(/^https?:\/\//, '') : 'No address'
}

function discardActions(site: Site): DropdownMenuItem[] | undefined {
  if (!canManageOrganization.value) return undefined
  if (site.onboarding_status === 'active') return undefined
  if (site.id !== discardableSiteId.value) return undefined
  return [{
    label: 'Discard site',
    icon: 'i-lucide-trash-2',
    color: 'error',
    onSelect: () => openDiscard(site),
  }]
}

/**
 * An unfinished site resumes the flow at the unscoped /dashboard/onboarding.
 * The shell there restores the draft and redirects to the step it stopped at,
 * so there is no resume logic here. There is no onboarding route under
 * /dashboard/{orgSlug}, which is what the previous branch pointed at.
 */
function siteDashboardPath(site: Site) {
  if (site.onboarding_status !== 'active') return '/dashboard/onboarding'
  if (!site.subdomain) {
    throw createError({ statusCode: 500, statusMessage: `Site ${site.id} is active with no subdomain` })
  }
  return `/dashboard/${orgSlug.value}/sites/${site.subdomain}`
}

function openDiscard(site: Site) {
  discardSite.value = site
  discardError.value = null
  discardOpen.value = true
}

async function confirmDiscard() {
  if (!await draft.discard()) {
    discardError.value = draft.error.value
    return
  }
  discardOpen.value = false
  discardSite.value = null
  discardableSiteId.value = null
  await dashboard.refresh()
  // The organization goes with the site when that site was its only one, and
  // this route is then a hub for an organization that no longer exists. Hand it
  // to the canonical entry router — which sends an owner with nothing left back
  // into onboarding — rather than rendering an empty grid for a dead org.
  if (!dashboard.organization.value) await navigateTo('/dashboard')
}

// Only asked when the hub is actually showing an unfinished site, so an
// organization whose sites are all live pays nothing for it.
watch(() => sites.value.some(site => site.onboarding_status !== 'active'), async (hasUnfinished) => {
  if (!import.meta.client || !hasUnfinished || !canManageOrganization.value) return
  if (discardableSiteId.value) return
  try {
    discardableSiteId.value = await draft.activeDraftSiteId()
  } catch (cause) {
    draftLookupError.value = cause instanceof Error ? cause.message : 'Something went wrong. Please try again.'
  }
}, { immediate: true })
</script>
