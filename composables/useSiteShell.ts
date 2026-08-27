// Site-wide chrome is a stable SSR resource keyed only by tenant and locale.
// Route-specific content is loaded separately so client navigation cannot
// replace the persistent header/footer state with another route's request.
import { buildPublicPageUrl, usePublicResourceKey, type PublicPageRequest } from "~/composables/usePublicPageRequest";
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
    && !requestEvent?.req.runtime?.cloudflare?.env
    && (
      requestEvent?.path?.startsWith('/_i18n/')
      || requestEvent?.path?.startsWith('/_nuxt/')
      || requestEvent?.path?.startsWith('/api/_nuxt_icon/')
      || requestEvent?.path?.startsWith('/__nuxt_error')
    );

  const entityId = computed(() => siteId || draftId || null);

  const params = computed<PublicPageRequest>(() => ({
    page: null,
    location: null,
    experience: null,
    datasets: [],
    blogSlug: null,
    locale: locale.value,
    token: typeof route.query.token === 'string' && route.path.startsWith('/preview/')
      ? route.query.token
      : null,
  }));

  const key = computed(() => usePublicResourceKey('shell', entityId.value, params.value));
  const url = computed(() => buildPublicPageUrl(siteId, params.value, route, 'shell'));

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

  const locations = computed(() => data.value?.locations ?? []);
  const config = computed(() => (data.value?.config ?? {}) as Record<string, string>);
  const shellSite = computed(() => data.value?.site ?? null);
  const googleBusiness = computed(() => data.value?.googleBusiness ?? null);
  const locales = computed(() => data.value?.locales ?? []);
  const hasExperiences = computed(() => data.value?.hasExperiences ?? false);
  const hasProducts = computed(() => data.value?.hasProducts ?? false);
  return {
    locations,
    config,
    site: shellSite,
    googleBusiness,
    locales,
    hasExperiences,
    hasProducts,
    data,
    pending,
    error,
    refresh,
    ready,
  };
};
