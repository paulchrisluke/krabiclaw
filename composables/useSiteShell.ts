// Site-wide chrome data (locations, config, menu, experiences list) for
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
// Page-specific content (photosList, qaList, blogPost, reviewsList, etc.)
// lives in useBootstrap(), which every page/child-component `await`s so
// Suspense blocks the route swap until the new page's real content is in
// hand. See useBootstrap.ts.
import { useBootstrapKey, useBootstrapUrl, type BootstrapParams } from "~/composables/useBootstrapParams";

interface ShellSiteInfo {
  brand_name?: string | null;
  brand_description?: string | null;
  logo_url?: string | null;
  logo_mime_type?: string | null;
  favicon_url?: string | null;
  vertical?: string | null;
  config?: {
    phone?: string | null;
  } | null;
}

interface SiteShellPayload {
  site: ShellSiteInfo | null;
  locations: ApiRecord[];
  config: Record<string, string>;
  googleBusiness: ApiRecord;
  locales: { code: string; label: string; is_source: boolean }[];
  hasExperiences: boolean;
  hasMenu: boolean;
}

const isSiteShellPayload = (value: unknown): value is SiteShellPayload =>
  isRecord(value)
  && (
    value.site === null
    || (
      isRecord(value.site)
      && (typeof value.site.brand_name === 'string' || value.site.brand_name === null)
      && (typeof value.site.vertical === 'string' || value.site.vertical === null)
    )
  )
  && Array.isArray(value.locations)
  && isRecord(value.config)
  && isRecord(value.googleBusiness)
  && Array.isArray(value.locales)
  && typeof value.hasExperiences === 'boolean'
  && typeof value.hasMenu === 'boolean'

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
