// Per-page content fetch (photos/qa/reviews/blog/menu/experience datasets,
// CMS content fields, booking policies). Site-wide chrome data that doesn't
// vary by route (locations, config, menu, experiencesList) lives in
// useSiteShell() instead — see that file for why the split exists.
//
// This is `await`-ed by every caller. That's load-bearing, not stylistic:
// the key is derived from the current route, so on client-side navigation
// the key changes on every page. A non-awaited useAsyncData here would let
// Vue render the new page with the OLD key's leftover data for a beat (or,
// if a component further down the tree never re-renders it, indefinitely)
// before the new fetch resolves — see krabiclaw issue #436/#437. Awaiting it
// at the top of each page's <script setup> makes Vue Router's Suspense
// boundary hold the previous page on screen until the new page's real data
// is in hand, exactly like pages/blog/[slug].vue's own post fetch already
// does correctly.
//
// Usage (in a page):
//   const { getField, getHero, photosList, qaList, ... } = await useBootstrap()
import { onMounted, onBeforeUnmount, unref } from "vue";
import type { Ref } from "vue";
import {
  useBootstrapParams,
  useBootstrapKey,
  useBootstrapUrl,
} from "~/composables/useBootstrapParams";
import { useSiteShell } from "~/composables/useSiteShell";
import type { RenderedBookingPolicySummary } from "~/server/utils/booking-policies";
import type { Experience } from "~/server/utils/experiences";

interface ContentRow {
  field: string;
  content: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_public_url: string | null;
  hero_kind: string | null;
  hero_video_public_url: string | null;
  hero_video_kind: string | null;
  thumbnail_url: string | null;
  component: string | null;
  [key: string]: unknown;
}

interface BootstrapPayload {
  locations: ApiRecord[];
  content: ContentRow[];
  locationReviews: ApiRecord[];
  reviewsAggregate: ApiRecord | null;
  reviewsList: ApiRecord[];
  photosList: ApiRecord[];
  qaList: ApiRecord[];
  postsList: ApiRecord[];
  blogList: ApiRecord[];
  blogPost: ApiRecord | null;
  reservationPolicySiteDefault: RenderedBookingPolicySummary | null;
  reservationPolicyByLocation: Record<string, RenderedBookingPolicySummary>;
  experiencePolicySiteDefault: RenderedBookingPolicySummary | null;
  experiencePolicyById: Record<string, RenderedBookingPolicySummary>;
  experienceDetail: Experience | null;
}

const emptyBootstrap = (): BootstrapPayload => ({
  locations: [],
  content: [],
  locationReviews: [],
  reviewsAggregate: null,
  reviewsList: [],
  photosList: [],
  qaList: [],
  postsList: [],
  blogList: [],
  blogPost: null,
  reservationPolicySiteDefault: null,
  reservationPolicyByLocation: {},
  experiencePolicySiteDefault: null,
  experiencePolicyById: {},
  experienceDetail: null,
});

export const useBootstrap = async (options: { enabled?: boolean | Ref<boolean> } = {}) => {
  const { isPlatform, siteId, draftId } = useTenantSite();
  const route = useRoute();
  const requestFetch = useRequestFetch();
  const params = useBootstrapParams();
  const entityId = computed(() => siteId || draftId || null);
  const key = computed(() => useBootstrapKey(entityId.value, params.value));
  const enabled = computed(() => options.enabled === undefined ? true : Boolean(unref(options.enabled)));

  const url = computed(() => useBootstrapUrl(siteId, params.value));

  const empty = emptyBootstrap();

  const shell = useSiteShell();

  const { data, error, pending } =
    isPlatform || !enabled.value || (!siteId && !draftId)
      ? { data: ref<BootstrapPayload>(empty), error: ref<Error | null>(null), pending: ref(false) }
      : await useAsyncData<BootstrapPayload>(
          key,
          async () => {
            if (!import.meta.server) return $fetch<BootstrapPayload>(url.value);
            // Nested SSR self-fetch (useRequestFetch) has been the source of a real bug
            // class elsewhere (pages/blog/[category]/[slug].vue, pages/docs/[...segments].vue):
            // Nitro's internal dispatch for those routes sometimes returned a wrong 404 that
            // an identical external request to the same URL didn't. This route's shape is
            // different (one path segment + query string, not multiple path segments) and
            // hasn't been reproduced failing the same way, but it's the highest-traffic
            // self-fetch in the app (every tenant page goes through it) — log on failure so
            // a future occurrence leaves evidence instead of a silent wrong render.
            try {
              return await requestFetch<BootstrapPayload>(url.value);
            } catch (err) {
              // url/key can carry a signed preview token on /preview/* routes — strip it
              // before logging so it doesn't end up in server logs. Key fields are
              // "~"-joined with the token last (see useBootstrapKey).
              const redactedUrl = url.value.replace(/([?&]token=)[^&]*/, "$1[redacted]");
              const redactedKey = params.value.token
                ? key.value.split("~").slice(0, -1).concat("[redacted]").join("~")
                : key.value;
              const errorSummary = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
              console.error(
                `[useBootstrap] SSR self-fetch failed for siteId=${siteId ?? "none"} draftId=${draftId ?? "none"} ` +
                  `route=${route.path} url=${redactedUrl} key=${redactedKey} error=${errorSummary}`,
              );
              throw err;
            }
          },
          {
            default: emptyBootstrap,
            server: true,
            watch: [url],
          },
        );

  // ── Locations / config / menu / experiences list ─────────────
  // Site-wide, page-independent — sourced from useSiteShell(), which never
  // goes stale across navigation because its key never changes.
  const { locations, config, googleBusiness, locales, hasExperiences, experiencesList, menu: menuData, menuItemsBySection } = shell;

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
      ["hero.title", "hero.subtitle", "hero.image", "hero.video"].includes(
        field,
      )
    ) {
      const heroRow = contentMap.value["hero"];
      const fieldRow = contentMap.value[field];
      if (field === "hero.title")
        return heroRow?.hero_title ?? fieldRow?.content ?? defaultValue;
      if (field === "hero.subtitle")
        return heroRow?.hero_subtitle ?? fieldRow?.content ?? defaultValue;
      if (field === "hero.image")
        return heroRow?.hero_public_url ?? fieldRow?.content ?? defaultValue;
      if (field === "hero.video")
        return (
          heroRow?.hero_video_public_url ?? fieldRow?.content ?? defaultValue
        );
    }
    const row = contentMap.value[field];
    if (!row) return defaultValue;
    const mediaValue =
      row.hero_public_url || row.hero_video_public_url || row.content;
    const val = row.type === "media" ? mediaValue : row.content;
    return val && val.trim() !== "" ? val : defaultValue;
  };

  const getFieldStr = (field: string, defaultValue = ""): string =>
    getField(field, defaultValue) ?? defaultValue;

  const getHero = (
    defaults = { title: "", subtitle: "", image: "", video: "" },
  ) => {
    const row = contentMap.value["hero"];
    return {
      title:
        getField("hero.title", row?.hero_title ?? defaults.title) ??
        defaults.title,
      subtitle:
        getField("hero.subtitle", row?.hero_subtitle ?? defaults.subtitle) ??
        defaults.subtitle,
      image:
        getField("hero.image", row?.hero_public_url ?? defaults.image) ??
        defaults.image,
      video:
        getField("hero.video", row?.hero_video_public_url ?? defaults.video) ??
        defaults.video,
      thumbnail_url: row?.thumbnail_url || null,
      imageKind: row?.hero_kind || "image",
      videoKind: row?.hero_video_kind || "video",
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
