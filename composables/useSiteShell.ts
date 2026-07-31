// Site-wide chrome data (brand, navigation flags, location summaries, locales,
// and persistent business metadata) for
// components that persist across client-side navigation — SayaHeader,
// SayaFooter, app.vue, and anything else that lives outside <NuxtPage> or
// otherwise doesn't remount per route.
//
// Keyed by siteId/draftId + locale ONLY — no page/location/experience/data
// params. That key never changes while browsing a site, so this fetch runs
// once per visit and simply has nothing to go stale when the route changes:
// it isn't guarded against picking up another page's data, it structurally
// can't, because there's no "another page's data" — the response never
// depended on the page in the first place.
//
// Page-specific content and collections live in useBootstrap(). Client
// navigation renders a destination-local loading state while that keyed page
// request is in flight.
import { useBootstrapKey, useBootstrapUrl, type BootstrapParams } from "~/composables/useBootstrapParams";

interface ShellSiteInfo {
  brand_name: string | null;
  brand_description: string | null;
  logo_url: string | null;
  logo_mime_type: string | null;
  favicon_url: string | null;
  vertical: string | null;
  config: {
    phone: string | null;
  } | null;
}

interface SiteShellPayload {
  site: ShellSiteInfo;
  locations: ApiRecord[];
  config: Record<string, string>;
  googleBusiness: ApiRecord;
  locales: { code: string; label: string; is_source: boolean }[];
  hasExperiences: boolean;
  hasMenu: boolean;
}

const isSiteShellPayload = (value: unknown): value is SiteShellPayload => {
  if (!isRecord(value)) return false
  if (!isRecord(value.site)) return false
  // Enforce exact contract: site fields must match declared types precisely
  if (typeof value.site.brand_name !== 'string' && value.site.brand_name !== null) return false
  if (typeof value.site.brand_description !== 'string' && value.site.brand_description !== null) return false
  if (typeof value.site.logo_url !== 'string' && value.site.logo_url !== null) return false
  if (typeof value.site.logo_mime_type !== 'string' && value.site.logo_mime_type !== null) return false
  if (typeof value.site.favicon_url !== 'string' && value.site.favicon_url !== null) return false
  if (typeof value.site.vertical !== 'string' && value.site.vertical !== null) return false
  if (value.site.config !== null && !isRecord(value.site.config)) return false
  if (isRecord(value.site.config)
    && typeof value.site.config.phone !== 'string'
    && value.site.config.phone !== null) return false

  if (!Array.isArray(value.locations)) return false
  if (!value.locations.every(location =>
    isRecord(location)
    && typeof location.id === 'string'
    && typeof location.slug === 'string'
    && typeof location.title === 'string',
  )) return false

  if (!isRecord(value.config)) return false
  if (!isRecord(value.googleBusiness)) return false
  if (value.googleBusiness.business !== null && !isRecord(value.googleBusiness.business)) return false
  if (!Array.isArray(value.googleBusiness.reviews)) return false
  if (!Array.isArray(value.googleBusiness.media)) return false
  if (!Array.isArray(value.googleBusiness.posts)) return false

  if (!Array.isArray(value.locales)) return false
  if (!value.locales.every(locale =>
    isRecord(locale)
    && typeof locale.code === 'string'
    && typeof locale.label === 'string'
    && typeof locale.is_source === 'boolean',
  )) return false

  if (typeof value.hasExperiences !== 'boolean') return false
  if (typeof value.hasMenu !== 'boolean') return false

  return true
}

export const useSiteShellState = () => {
  const { isPlatform, siteId, draftId } = useTenantSite();
  const requestEvent = useRequestEvent();
  const route = useRoute();
  const { locale } = useI18n();
  const isSyntheticServerAssetFetch = import.meta.server
    && !requestEvent?.context.cloudflare?.env
    && (
      requestEvent?.path?.startsWith('/_i18n/')
      || requestEvent?.path?.startsWith('/_nuxt/')
      || requestEvent?.path?.startsWith('/api/_nuxt_icon/')
      || requestEvent?.path?.startsWith('/__nuxt_error')
    );

  const entityId = computed(() => siteId || draftId || null);

  // Fixed, page-independent params — this is what makes the key stable.
  const params = computed<BootstrapParams>(() => ({
    page: null,
    location: null,
    experience: null,
    menu: false,
    data: null,
    blogSlug: null,
    locale: locale.value,
    token: typeof route.query.token === "string" && route.path.startsWith("/preview/") ? route.query.token : null,
  }));

  const key = computed(() => `shell~${useBootstrapKey(entityId.value, params.value)}`);
  const url = computed(() => useBootstrapUrl(siteId, params.value, 'shell'));

  let data: Ref<SiteShellPayload | undefined>
  let error: Ref<Error | null>
  let pending: Ref<boolean>
  let refresh: () => Promise<unknown>
  let ready: Promise<unknown>
  if (isSyntheticServerAssetFetch || isPlatform || (!siteId && !draftId)) {
    data = ref<SiteShellPayload>()
    error = ref<Error | null>(null)
    pending = ref(false)
    refresh = async () => {}
    ready = Promise.resolve()
  } else {
    const asyncData = useAsyncData<SiteShellPayload>(
          key,
          (_nuxtApp, { signal }) => loadPublicBootstrapPayload<SiteShellPayload>({
              draftId,
              siteId,
              url: url.value,
              key: key.value,
              query: {
                contract: 'shell',
                locale: params.value.locale ?? undefined,
                token: params.value.token ?? undefined,
              },
              validate: isSiteShellPayload,
              failureMessage: 'Public shell failed',
              signal,
            }),
          { server: true, dedupe: 'cancel' },
        );
    data = asyncData.data
    error = asyncData.error as Ref<Error | null>
    pending = asyncData.pending
    refresh = asyncData.refresh
    ready = import.meta.server ? asyncData : Promise.resolve()
  }

  const locations = computed(() => (data.value?.locations ?? []) as ApiRecord[]);
  const config = computed(() => (data.value?.config ?? {}) as Record<string, string>);
  const shellSite = computed(() => data.value?.site ?? null);
  const googleBusiness = computed(() => data.value?.googleBusiness ?? null);
  const locales = computed(() => data.value?.locales ?? []);
  const hasExperiences = computed(() => data.value?.hasExperiences ?? false);
  const hasMenu = computed(() => data.value?.hasMenu ?? false);
  return {
    locations,
    config,
    site: shellSite,
    googleBusiness,
    locales,
    hasExperiences,
    hasMenu,
    data,
    pending,
    error,
    refresh,
    ready,
  };
};
