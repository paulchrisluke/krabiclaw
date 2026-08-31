
// Maps each public route to the exact page datasets it may request.
//
// Page type → SSR call mapping:
//   /locations/[slug]/reviews  → type A  (reviews data included)
//   /locations                 → type B
//   /locations/[slug]          → type C  (Products, reviews, and posts previews included)
//   regular pages (/, /about…) → type D
//   /locations/[slug]/photos   → type E  (photos data included)
//   /locations/[slug]/qa       → type F  (qa data included)
//   /locations/[slug]/posts    → type G  (posts data included)
export type PublicPageDataset =
  | 'content'
  | 'location'
  | 'products'
  | 'reviews'
  | 'photos'
  | 'qa'
  | 'posts'
  | 'blog'
  | 'blogPost'
  | 'experiences'
  | 'experienceDetail'
  | 'reservationPolicies'
  | 'experiencePolicies'

import { splitLocalePrefix } from '~/utils/tenant-locale-path'

export interface PublicPageRequest {
  page: string | null;
  location: string | null;
  experience: string | null;
  datasets: readonly PublicPageDataset[];
  blogSlug: string | null; // set when the blogPost dataset is requested
  locale: string | null;
  token: string | null; // signed preview token — non-null only on /preview/site/... routes
}

export function getPublicCriticalHomeRequest(params: PublicPageRequest): PublicPageRequest {
  return {
    ...params,
    page: 'home',
    location: null,
    experience: null,
    datasets: ['content'],
    blogSlug: null,
  }
}

// Extracts the page sub-path from a platform preview route path.
// Returns null if the path is not a preview route.
export function getPreviewSubpath(path: string): string | null {
  const match = path.match(/^\/preview\/(?:site|draft)\/[^/]+(\/.*)?$/)
  if (!match) return null
  return match[1] || '/'
}

export function getPublicPageRequest(path: string): Omit<PublicPageRequest, "locale" | "token"> {

  // Location sub-pages: /locations/[slug]/*
  const locationMatch = path.match(/^\/locations\/([^/]+)/);
  if (locationMatch) {
    const slug = locationMatch[1];
    const segments = path.split("/");
    const sub = segments.length > 3 ? segments[3] : undefined;
    const page = sub || "location";
    const fullData =
      page === "reviews" || page === "photos" || page === "qa" || page === "posts"
        ? page
        : null;
    return {
      page,
      location: slug ?? null,
      experience: null,
      datasets: [
        'content',
        'location',
        ...(page === 'location' || page === 'menu' || page === 'products' ? ['products'] as const : []),
        ...(page === "location" || page === "menu" || page === 'products' || page === "experiences"
          ? ['experiences', 'experiencePolicies'] as const
          : []),
        ...(page === "location" ? ['reviews', 'posts'] as const : []),
        ...(fullData ? [fullData] as PublicPageDataset[] : []),
      ],
      blogSlug: null,
    };
  }

  // Experience detail: /experiences/[slug]
  const experienceMatch = path.match(/^\/experiences\/([^/]+)/);
  if (experienceMatch) {
    return {
      page: "experiences",
      location: null,
      experience: experienceMatch[1] ?? null,
      datasets: ['content', 'experiences', 'experienceDetail', 'experiencePolicies'],
      blogSlug: null,
    };
  }

  // Blog post detail: /blog/[slug] — single segment only. Deeper paths like
  // /blog/[category]/[slug] belong to pages/blog/[category]/[slug].vue and
  // must not be captured here, or the wrong segment ends up as blogSlug.
  const blogMatch = path.match(/^\/blog\/([^/]+)\/?$/);
  if (blogMatch) {
    return {
      page: "blog",
      location: null,
      experience: null,
      datasets: ['blogPost'],
      blogSlug: blogMatch[1] ?? null,
    };
  }

  const articleMatch = path.match(/^\/article\/([^/]+)\/?$/);
  if (articleMatch) {
    return {
      page: "blog",
      location: null,
      experience: null,
      datasets: ['blogPost'],
      blogSlug: articleMatch[1] ?? null,
    };
  }

  // Top-level pages
  if (path === "/" || path === "")
    return {
      page: "home",
      location: null,
      experience: null,
      datasets: ['content', 'location', 'products', 'experiences'],
      blogSlug: null,
    };
  if (path.startsWith("/locations"))
    return {
      page: "locations",
      location: null,
      experience: null,
      datasets: ['content', 'location'],
      blogSlug: null,
    };
  if (path.startsWith("/about"))
    return {
      page: "about",
      location: null,
      experience: null,
      datasets: ['content'],
      blogSlug: null,
    };
  if (path.startsWith("/contact"))
    return {
      page: "contact",
      location: null,
      experience: null,
      datasets: ['content'],
      blogSlug: null,
    };
  if (path.startsWith("/reservations"))
    return {
      page: "reservations",
      location: null,
      experience: null,
      datasets: ['content', 'reservationPolicies'],
      blogSlug: null,
    };
  if (path.startsWith("/order"))
    return {
      page: "order",
      location: null,
      experience: null,
      datasets: ['content'],
      blogSlug: null,
    };
  if (path.startsWith("/qa"))
    return {
      page: "qa",
      location: null,
      experience: null,
      datasets: ['content', 'qa'],
      blogSlug: null,
    };
  if (path.startsWith("/reviews"))
    return {
      page: "reviews",
      location: null,
      experience: null,
      datasets: ['content', 'reviews'],
      blogSlug: null,
    };
  if (path.startsWith("/posts"))
    return {
      page: "posts",
      location: null,
      experience: null,
      datasets: ['content', 'posts'],
      blogSlug: null,
    };
  if (path.startsWith("/experiences"))
    return {
      page: "experiences",
      location: null,
      experience: null,
      datasets: ['content', 'experiences', 'experiencePolicies'],
      blogSlug: null,
    };
  if (path.startsWith("/photos"))
    return {
      page: "photos",
      location: null,
      experience: null,
      datasets: ['content', 'photos'],
      blogSlug: null,
    };
  if (path === "/menu" || path.startsWith("/menu/"))
    return {
      page: "menu",
      location: null,
      experience: null,
      datasets: ['content', 'products'],
      blogSlug: null,
    };
  if (path === '/products' || path.startsWith('/products/'))
    return {
      page: 'products',
      location: null,
      experience: null,
      datasets: ['content', 'products'],
      blogSlug: null,
    };
  if (path === "/blog" || path === "/blog/")
    return {
      page: "blog",
      location: null,
      experience: null,
      datasets: ['blog'],
      blogSlug: null,
    };

    return {
      page: null,
      location: null,
      experience: null,
      datasets: [],
      blogSlug: null,
    };
}

export const usePublicPageRequest = () => {
  const route = useRoute();
  const locale = useState<string>('public-locale', () => 'en')

  return computed<PublicPageRequest>(() => {
    const previewSubpath = getPreviewSubpath(route.path)
    const effectivePath = previewSubpath ?? route.path
    const localePath = splitLocalePrefix(effectivePath)
    const token = previewSubpath !== null && typeof route.query.token === 'string'
      ? route.query.token
      : null
    return {
      ...getPublicPageRequest(localePath.sourcePath),
      locale: localePath.localeSegment ?? locale.value,
      token,
    }
  });
};

// Each field is percent-encoded and joined with "~" (not a valid URI-component
// character) so a hyphen inside a slug/locale can't be mistaken for a field
// separator and collide two otherwise-distinct param combinations.
// encodeURIComponent doesn't escape "~", so we replace it explicitly to avoid
// delimiter collisions.
const encodeKeyField = (value: string | null | undefined): string =>
  encodeURIComponent(value ?? "").replace(/~/g, '%7E');

export const usePublicResourceKey = (
  resourceKind: 'shell' | 'page',
  siteId: string | null | undefined,
  params: PublicPageRequest,
) =>
  [
    resourceKind,
    encodeKeyField(siteId ?? "none"),
    encodeKeyField(params.page),
    encodeKeyField(params.location),
    encodeKeyField(params.experience),
    encodeKeyField([...params.datasets].sort().join(',')),
    encodeKeyField(params.blogSlug),
    encodeKeyField(params.locale),
    encodeKeyField(params.token),
  ].join("~");

export const usePublicPageKey = (
  siteId: string | null | undefined,
  params: PublicPageRequest,
) => usePublicResourceKey('page', siteId, params)

export const buildPublicPageUrl = (
  siteId: string | null | undefined,
  params: PublicPageRequest,
  route: { path: string; params: Record<string, unknown> },
  resourceKind: 'shell' | 'page' = 'page',
) => {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", params.page);
  if (params.location) qs.set("location", params.location);
  if (params.experience) qs.set("experience", params.experience);
  if (params.datasets.length) qs.set("datasets", [...params.datasets].sort().join(','));
  if (params.blogSlug) qs.set("blogSlug", params.blogSlug);
  if (params.token) {
    qs.set("preview", "true");
    qs.set("token", params.token);
  }
  const draftId = typeof route.params.draftId === 'string' && route.path.startsWith('/preview/draft/')
    ? route.params.draftId
    : null
  if (!draftId && params.locale && params.locale !== 'en') qs.set('locale', params.locale)
  const q = qs.toString();
  if (draftId) {
    const draftQuery = qs.toString()
    return `/api/public/drafts/${draftId}/${resourceKind}${draftQuery ? `?${draftQuery}` : ""}`
  }
  return `/api/public/sites/${siteId}/${resourceKind}${q ? `?${q}` : ""}`;
};
