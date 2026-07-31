// Per-page content fetch (photos/qa/reviews/blog/menu/experience datasets,
// CMS content fields, booking policies). Site-wide chrome data that doesn't
// vary by route (brand, location summaries, config, locales, navigation
// capabilities) lives in the site-shell loader instead.
//
// SSR waits for route data so rendered HTML is complete. Client navigation
// starts the keyed request lazily and returns immediately; the Saya layout
// replaces the old route with a destination-local loading or error state.
//
// Usage (in a page):
//   const { getField, getHero, photosList, qaList, ... } = await usePublicPageData()
import { onMounted, onBeforeUnmount } from "vue";
import {
  usePublicPageRequest,
  usePublicPageKey,
  usePublicPageUrl,
} from "~/composables/usePublicPageRequest";
import { useSiteShellState } from "~/composables/useSiteShell";
import type { Experience } from "~/server/utils/experiences";
import {
  isPublicPagePayload,
  type PublicPagePayload,
} from '~/utils/public-resource-contracts'

interface ContentRow {
  field: string;
  content: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_public_url: string | null;
  hero_kind: string | null;
  thumbnail_url: string | null;
  component: string | null;
  [key: string]: unknown;
}

export const usePublicPageData = async (options: { enabled?: boolean } = {}) => {
  const { isPlatform, siteId, draftId } = useTenantSite();
  const route = useRoute();
  const params = usePublicPageRequest();
  const routeLoadState = usePublicRouteLoadState();
  const routeLoadOwner = claimPublicRouteLoadOwner();
  onScopeDispose(routeLoadOwner.release)
  const ownedPath = route.path;
  const entityId = computed(() => siteId || draftId || null);
  const key = computed(() => usePublicPageKey(entityId.value, params.value));
  const enabled = computed(() => options.enabled !== false);

  const url = computed(() => usePublicPageUrl(siteId, params.value));

  const shell = useSiteShellState();

  const asyncData =
    isPlatform || !enabled.value || (!siteId && !draftId)
      ? { data: ref<PublicPagePayload>(), error: ref<Error | null>(null), pending: ref(false), refresh: async () => {} }
      : useAsyncData<PublicPagePayload>(
          key,
          (_nuxtApp, { signal }) => loadPublicResourcePayload<PublicPagePayload>({
              draftId,
              siteId,
              resourceKind: 'page',
              url: url.value,
              key: key.value,
              query: {
                page: params.value.page ?? undefined,
                location: params.value.location ?? undefined,
                experience: params.value.experience ?? undefined,
                datasets: [...params.value.datasets].sort().join(',') || undefined,
                blogSlug: params.value.blogSlug ?? undefined,
                locale: params.value.locale ?? undefined,
                token: params.value.token ?? undefined,
              },
              validate: (value): value is PublicPagePayload =>
                isPublicPagePayload(value, params.value.page ?? 'home'),
              failureMessage: 'Public page failed',
              signal,
            }),
          {
            server: true,
            lazy: import.meta.client,
            dedupe: 'cancel',
          },
        );
  if (import.meta.server) {
    await Promise.all([asyncData, shell.ready])
    if (asyncData.error.value) throw asyncData.error.value
    if (shell.error.value) throw shell.error.value
  }
  const { data, error, pending, refresh } = asyncData
  watchEffect(() => {
    if (!routeLoadOwner.ownsState()) return
    routeLoadState.value = {
      path: ownedPath,
      key: key.value,
      pending: pending.value,
      error: normalizePublicRouteLoadError(error.value),
      hasData: data.value !== undefined,
    }
  })

  // Persistent chrome data comes from the stable shell. Route-owned collections
  // come from the keyed page response and change with navigation.
  const { locations, config, locales, hasExperiences } = shell;
  const googleBusiness = computed(() => ({
    ...(shell.googleBusiness.value ?? {}),
    reviews: data.value?.globalReviews ?? [],
    posts: data.value?.globalPosts ?? [],
  }))
  const experiencesList = computed(() => data.value?.experiencesList ?? []);
  const menuData = computed(() => data.value?.menu ?? null);
  const menuItemsBySection = computed(() => {
    const menu = menuData.value as { items?: ApiRecord[] } | null;
    return (menu?.items ?? []).reduce<Record<string, ApiRecord[]>>((groups, item) => {
      const section = typeof item.section === "string" ? item.section : "Uncategorized";
      (groups[section] ??= []).push(item);
      return groups;
    }, {});
  });

  // ── Single location (for /locations/[slug]/* pages) ───────
  const location = computed(() => {
    if (!params.value.location) return null;
    return locations.value.find((l) => l.slug === params.value.location) ?? null;
  });

  // ── Location reviews preview (3 items) ───────────────────
  const locationReviews = computed(() => (data.value?.locationReviews ?? []) as ApiRecord[]);

  // ── Full page datasets (types A / E / F) ─────────────────
  const reviewsAggregate = computed(() => (data.value?.reviewsAggregate ?? null) as ApiRecord | null);
  const reviewsList = computed(() => (data.value?.reviewsList ?? []) as ApiRecord[]);
  const photosList = computed(() => (data.value?.photosList ?? []) as ApiRecord[]);
  const qaList = computed(() => (data.value?.qaList ?? []) as ApiRecord[]);
  const postsList = computed(() => (data.value?.postsList ?? []) as ApiRecord[]);
  const blogList = computed(() => (data.value?.blogList ?? []) as ApiRecord[]);
  const blogPost = computed(() => (data.value?.blogPost ?? null) as ApiRecord | null);

  const reservationPolicySiteDefault = computed(() => data.value?.reservationPolicySiteDefault ?? null);
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
        return heroRow?.hero_public_url ?? fieldRow?.content ?? defaultValue;
    }
    const row = contentMap.value[field];
    if (!row) return defaultValue;
    const mediaValue = row.hero_public_url || row.content;
    const val = row.type === "media" ? mediaValue : row.content;
    return val && val.trim() !== "" ? val : defaultValue;
  };

  const getFieldStr = (field: string, defaultValue = ""): string =>
    getField(field, defaultValue) ?? defaultValue;

  const getHero = (
    defaults = { title: "", subtitle: "", image: "", video: "" },
  ) => {
    const row = contentMap.value["hero"];
    const heroMedia = row?.hero_public_url || "";
    const isVideo = row?.hero_kind === "video";
    return {
      title:
        getField("hero.title", row?.hero_title ?? defaults.title) ??
        defaults.title,
      subtitle:
        getField("hero.subtitle", row?.hero_subtitle ?? defaults.subtitle) ??
        defaults.subtitle,
      image:
        (isVideo ? defaults.image : getField("hero.media", heroMedia || defaults.image)) ??
        defaults.image,
      video:
        (isVideo ? getField("hero.media", heroMedia || defaults.video) : defaults.video) ??
        defaults.video,
      thumbnail_url: row?.thumbnail_url || null,
      imageKind: isVideo ? "image" : (row?.hero_kind || "image"),
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

  return {
    data,
    pending,
    refresh,
    locations,
    location,
    config,
    googleBusiness,
    locationReviews,
    reviewsAggregate,
    reviewsList,
    photosList,
    qaList,
    postsList,
    blogList,
    blogPost,
    locales,
    reservationPolicySiteDefault,
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
    menu: menuData,
    menuItemsBySection,
    error,
  };
};
