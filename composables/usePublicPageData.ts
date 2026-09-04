// Route content and persistent site chrome are separate public resources. Route
// consumers select their datasets from the validated route response.
//
// Every route consumes its validated public payload directly. The shared shell
// and route loaders keep persistent chrome and route content on one contract.
//
// Usage (in a page):
//   const { getField, getHero, media, qaList, ... } = await usePublicPageData()
import { onMounted, onBeforeUnmount, watch } from "vue";
import {
  usePublicPageRequest,
  usePublicPageKey,
  buildPublicPageUrl,
  type PublicPageDataset,
} from "~/composables/usePublicPageRequest";
import { useSiteShellState } from "~/composables/useSiteShell";
import type { Experience } from "~/server/utils/experiences";
import type { Product } from '~/server/types/products'
import {
  isPublicPagePayload,
  type PublicLocaleRepresentation,
  type PublicPagePayload,
} from '~/utils/public-resource-contracts'

interface ContentRow {
  field: string;
  content: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  media?: Array<{ asset_id: string; slot: string; public_url: string | null; thumbnail_url?: string | null; kind?: string | null }>;
  component: string | null;
  [key: string]: unknown;
}

const throwPublicPageError = (error: unknown): never => {
  const record = typeof error === 'object' && error !== null
    ? error as Record<string, unknown>
    : {}
  const statusCode = typeof record.statusCode === 'number'
    ? record.statusCode
    : typeof record.status === 'number'
      ? record.status
      : 500
  const statusMessage = typeof record.statusMessage === 'string'
    ? record.statusMessage
    : error instanceof Error
      ? error.message
      : 'Public page failed'

  throw createError({ statusCode, statusMessage, fatal: import.meta.client, cause: error })
}

export const usePublicPageData = async (options: {
  datasets?: readonly PublicPageDataset[]
  server?: boolean
  lazy?: boolean
  routeOwned?: boolean
} = {}) => {
  const { isPlatform, siteId, draftId } = useTenantSite();
  const route = useRoute();
  const params = usePublicPageRequest();
  const entityId = siteId || draftId || null;
  const requestedParams = computed(() => options.datasets
    ? { ...params.value, datasets: [...options.datasets] }
    : { ...params.value, datasets: [...params.value.datasets] })
  const key = computed(() => usePublicPageKey(entityId, requestedParams.value));

  const url = computed(() => buildPublicPageUrl(siteId, requestedParams.value, route));

  const shell = useSiteShellState();
  const requestEvent = import.meta.server ? useRequestEvent() : undefined
  const deferredSupplement = options.routeOwned === false
    && options.server === false
    && options.lazy === true;

  const asyncData =
    isPlatform || (!siteId && !draftId)
      ? { data: ref<PublicPagePayload>(), error: ref<Error | null>(null), pending: ref(false), refresh: async () => {} }
      : useAsyncData<PublicPagePayload>(
          key,
          (_nuxtApp, { signal }) => {
            const currentParams = requestedParams.value
            return loadPublicResourcePayload<PublicPagePayload>({
              draftId,
              siteId,
              resourceKind: 'page',
              url: url.value,
              key: key.value,
              query: {
                page: currentParams.page ?? undefined,
                location: currentParams.location ?? undefined,
                experience: currentParams.experience ?? undefined,
                datasets: [...currentParams.datasets].sort().join(',') || undefined,
                blogSlug: currentParams.blogSlug ?? undefined,
                locale: currentParams.locale ?? undefined,
                token: currentParams.token ?? undefined,
              },
              validate: (value): value is PublicPagePayload =>
                isPublicPagePayload(value, currentParams.page ?? 'home'),
              failureMessage: 'Public page failed',
              signal,
              requestEvent,
            })
          },
          {
            server: options.server ?? true,
            lazy: deferredSupplement,
            dedupe: 'defer',
            immediate: !deferredSupplement,
            watch: [],
          },
        );
  if (import.meta.client && deferredSupplement && 'execute' in asyncData) {
    onMounted(() => void asyncData.execute());
  }
  const { data, error, pending, refresh } = asyncData
  const localeRepresentations = useState<PublicLocaleRepresentation[]>('public-locale-representations', () => [])
  if (options.routeOwned !== false) {
    watch(
      () => data.value?.localeRepresentations,
      representations => { localeRepresentations.value = representations ?? [] },
      { immediate: true },
    )
  }

  // Persistent chrome comes from the stable shell. Route-owned collections
  // come from the keyed page response and change with navigation.
  const { locations, config, site, locales, hasExperiences } = shell;
  const googleBusiness = computed(() => ({
    ...(shell.googleBusiness.value ?? {}),
    reviews: data.value?.globalReviews ?? [],
    posts: data.value?.globalPosts ?? [],
  }))
  const experiencesList = computed(() => data.value?.experiencesList ?? []);
  const products = computed(() => data.value?.products ?? []);
  const productsByCategory = computed(() => {
    return products.value.reduce<Record<string, Product[]>>((groups, product) => {
      (groups[product.category.name] ??= []).push(product);
      return groups;
    }, {});
  });

  // ── Single location (for /locations/[slug]/* pages) ───────
  const location = computed(() => {
    if (!requestedParams.value.location) return null;
    return locations.value.find((l) => l.slug === requestedParams.value.location) ?? null;
  });

  // ── Location reviews preview (3 items) ───────────────────
  const locationReviews = computed(() => (data.value?.locationReviews ?? []) as ApiRecord[]);

  // ── Full page datasets (types A / E / F) ─────────────────
  const reviewsAggregate = computed(() => (data.value?.reviewsAggregate ?? null) as ApiRecord | null);
  const reviewsList = computed(() => (data.value?.reviewsList ?? []) as ApiRecord[]);
  const media = computed(() => (data.value?.media ?? []) as ApiRecord[]);
  const qaList = computed(() => (data.value?.qaList ?? []) as ApiRecord[]);
  const postsList = computed(() => (data.value?.postsList ?? []) as ApiRecord[]);
  const blogList = computed(() => (data.value?.blogList ?? []) as ApiRecord[]);
  const blogPost = computed(() => (data.value?.blogPost ?? null) as ApiRecord | null);
  const tenantPage = computed(() => data.value?.tenant_page ?? null);

  const reservationPolicyByLocation = computed(() => data.value?.reservationPolicyByLocation ?? {});
  const experiencePolicySiteDefault = computed(() => data.value?.experiencePolicySiteDefault ?? null);
  const experiencePolicyById = computed(() => data.value?.experiencePolicyById ?? {});
  const experienceDetail = computed(() => (data.value?.experienceDetail ?? null) as Experience | null);

  // ── Content ───────────────────────────────────────────────
  const contentMap = computed(() => {
    const rows = (data.value?.content ?? []) as ContentRow[];
    return rows.reduce<Record<string, ContentRow>>((acc, row) => {
      acc[row.field] = row;
      return acc;
    }, {});
  });

  const previewOverrides = ref<Record<string, string>>({});
  if (import.meta.client) {
    const isPreview = computed(() => route.query.preview === "true");
    const expectedOrigin = computed(() => {
      try {
        return new URL(window.location.href).origin;
      } catch {
        return null;
      }
    });

    const handler = (e: MessageEvent) => {
      if (!isPreview.value) return;
      if (!expectedOrigin.value) return;
      if (e.origin !== expectedOrigin.value) return;
      const msg = e.data;
      if (msg?.type !== "admin:content-update") return;
      if (typeof msg.field !== "string" || typeof msg.value !== "string")
        return;
      previewOverrides.value = {
        ...previewOverrides.value,
        [msg.field]: msg.value,
      };
    };

    onMounted(() => {
      window.addEventListener("message", handler);
    });

    onBeforeUnmount(() => {
      window.removeEventListener("message", handler);
    });
  }

  const getField = (
    field: string,
    defaultValue: string | null = null,
  ): string | null => {
    if (Object.prototype.hasOwnProperty.call(previewOverrides.value, field)) {
      return previewOverrides.value[field] ?? null;
    }
    if (
      ["hero.title", "hero.subtitle", "hero.media"].includes(
        field,
      )
    ) {
      const heroRow = contentMap.value["hero"];
      const fieldRow = contentMap.value[field];
      if (field === "hero.title")
        return heroRow?.hero_title ?? fieldRow?.content ?? defaultValue;
      if (field === "hero.subtitle")
        return heroRow?.hero_subtitle ?? fieldRow?.content ?? defaultValue;
      if (field === "hero.media")
        return heroRow?.media?.find(item => item.slot === 'media')?.public_url ?? defaultValue;
    }
    const row = contentMap.value[field];
    if (!row) return defaultValue;
    const mediaValue = row.media?.[0]?.public_url || row.content;
    const val = row.type === "media" ? mediaValue : row.content;
    return val && val.trim() !== "" ? val : defaultValue;
  };

  const getFieldStr = (field: string, defaultValue = ""): string =>
    getField(field, defaultValue) ?? defaultValue;

  const getHero = (
    defaults = { title: "", subtitle: "", image: "", video: "" },
  ) => {
    const row = contentMap.value["hero"];
    const heroMedia = row?.media?.find(item => item.slot === 'media') ?? null;
    const isVideo = heroMedia?.kind === "video";
    return {
      title:
        getField("hero.title", row?.hero_title ?? defaults.title) ??
        defaults.title,
      subtitle:
        getField("hero.subtitle", row?.hero_subtitle ?? defaults.subtitle) ??
        defaults.subtitle,
      image:
        (isVideo ? defaults.image : getField("hero.media", heroMedia?.public_url || defaults.image)) ??
        defaults.image,
      video:
        (isVideo ? getField("hero.media", heroMedia?.public_url || defaults.video) : defaults.video) ??
        defaults.video,
      thumbnail_url: heroMedia?.thumbnail_url || null,
      imageKind: isVideo ? "image" : (heroMedia?.kind || "image"),
      videoKind: isVideo ? "video" : "video",
    };
  };

  // ── Content Blocks for Dynamic Rendering ───────────────────
  const contentBlocks = computed(() => {
    const rows = (data.value?.content ?? []) as ContentRow[];
    return rows.map((row) => ({
      ...row,
      _uid: row.field, // Use field as unique identifier for now
      component: row.component || null,
    }));
  });

  // Register every lifecycle hook above before suspending setup. Route-owned
  // data is authoritative: navigation completes only after this single request
  // succeeds, and failures propagate to Nuxt's error boundary.
  if (!deferredSupplement && 'then' in asyncData) {
    await asyncData
    if (asyncData.error.value) throwPublicPageError(asyncData.error.value)
  }
  if (options.routeOwned !== false) {
    localeRepresentations.value = data.value?.localeRepresentations ?? []
  }
  await shell.ready
  if (options.routeOwned !== false && shell.error.value) throwPublicPageError(shell.error.value)

  return {
    data,
    pending,
    refresh,
    locations,
    site,
    location,
    config,
    googleBusiness,
    locationReviews,
    reviewsAggregate,
    reviewsList,
    media,
    qaList,
    postsList,
    blogList,
    blogPost,
    tenantPage,
    locales,
    reservationPolicyByLocation,
    experiencePolicySiteDefault,
    experiencePolicyById,
    hasExperiences,
    experiencesList,
    experienceDetail,
    getField,
    getFieldStr,
    getHero,
    contentMap,
    contentBlocks,
    products,
    productsByCategory,
    error,
    localeRepresentations,
  };
};
