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
// Page-specific content and collections live in usePublicPageData(). Client
// navigation renders a destination-local loading state while that keyed page
// request is in flight.
import { usePublicResourceKey, usePublicPageUrl, type PublicPageRequest } from "~/composables/usePublicPageRequest";
import {
  isPublicShellPayload,
  type PublicShellPayload as SiteShellPayload,
} from '~/utils/public-resource-contracts'

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
  const params = computed<PublicPageRequest>(() => ({
    page: null,
    location: null,
    experience: null,
    datasets: [],
    blogSlug: null,
    locale: locale.value,
    token: typeof route.query.token === "string" && route.path.startsWith("/preview/") ? route.query.token : null,
  }));

  const key = computed(() => usePublicResourceKey('shell', entityId.value, params.value));
  const url = computed(() => usePublicPageUrl(siteId, params.value, 'shell'));

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
          (_nuxtApp, { signal }) => loadPublicResourcePayload<SiteShellPayload>({
              draftId,
              siteId,
              resourceKind: 'shell',
              url: url.value,
              key: key.value,
              query: {
                locale: params.value.locale ?? undefined,
                token: params.value.token ?? undefined,
              },
              validate: isPublicShellPayload,
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
