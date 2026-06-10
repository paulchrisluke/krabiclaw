import type {
  CompiledCuratedSiteBundle,
  CompiledSeedExperience,
  CompiledSeedMediaAsset,
  CompiledSeedSiteContent,
  CuratedSiteDefinition,
} from './contracts.ts'

function uniqueStrings(values: string[], label: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(`Duplicate ${label} values are not allowed`)
  }
}

export function compileCuratedSiteFixture(
  fixture: CuratedSiteDefinition,
): CompiledCuratedSiteBundle {
  const locationIds = new Set(fixture.locations.map((location) => location.id))
  const mediaIds = new Set(fixture.mediaAssets.map((asset) => asset.id))

  uniqueStrings(fixture.locations.map((location) => location.id), 'location id')
  uniqueStrings(fixture.locations.map((location) => location.slug), 'location slug')
  uniqueStrings(fixture.siteLocales.map((locale) => locale.id), 'site locale id')
  uniqueStrings(fixture.siteLocales.map((locale) => locale.locale), 'site locale')
  uniqueStrings(fixture.siteDomains.map((domain) => domain.id), 'site domain id')
  uniqueStrings(fixture.siteDomains.map((domain) => domain.domain), 'site domain')
  uniqueStrings(fixture.mediaAssets.map((asset) => asset.id), 'media asset id')
  uniqueStrings(fixture.mediaAssets.map((asset) => asset.fileName), 'media asset file name')
  uniqueStrings(fixture.siteContent.map((entry) => entry.id), 'site content id')
  uniqueStrings(fixture.experiences.map((experience) => experience.id), 'experience id')
  uniqueStrings(fixture.experiences.map((experience) => experience.slug), 'experience slug')
  uniqueStrings(fixture.publicRoutes.map((route) => route.path), 'public route path')

  const mediaAssets: CompiledSeedMediaAsset[] = fixture.mediaAssets.map((asset) => {
    if (asset.locationId && !locationIds.has(asset.locationId)) {
      throw new Error(`Media asset "${asset.id}" references unknown location "${asset.locationId}"`)
    }

    return {
      id: asset.id,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      locationId: asset.locationId,
      kind: 'image',
      provider: 'external_url',
      source: 'external',
      publicUrl: asset.publicUrl,
      thumbnailUrl: asset.thumbnailUrl,
      mimeType: asset.mimeType,
      fileName: asset.fileName,
      altText: asset.altText,
      category: asset.category,
      status: 'active',
    }
  })

  const siteContent: CompiledSeedSiteContent[] = fixture.siteContent.map((entry) => {
    if (entry.locationId && !locationIds.has(entry.locationId)) {
      throw new Error(`Site content "${entry.id}" references unknown location "${entry.locationId}"`)
    }

    return {
      id: entry.id,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      locationId: entry.locationId,
      page: entry.page,
      field: entry.field,
      content: entry.content,
      heroTitle: null,
      heroSubtitle: null,
      heroImageAssetId: null,
      type: entry.type,
      source: entry.source ?? 'manual',
    }
  })

  const experiences: CompiledSeedExperience[] = fixture.experiences.map((experience) => {
    if (!locationIds.has(experience.locationId)) {
      throw new Error(
        `Experience "${experience.id}" references unknown location "${experience.locationId}"`,
      )
    }
    if (!mediaIds.has(experience.imageAssetId)) {
      throw new Error(
        `Experience "${experience.id}" references unknown image asset "${experience.imageAssetId}"`,
      )
    }

    return {
      id: experience.id,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      locationId: experience.locationId,
      title: experience.title,
      slug: experience.slug,
      tagline: experience.tagline,
      body: experience.body,
      imageAssetId: experience.imageAssetId,
      price: experience.price,
      durationMinutes: experience.durationMinutes,
      maxCapacity: experience.maxCapacity,
      timeSlots: [...experience.timeSlots],
      availableNote: experience.availableNote,
      status: experience.status,
      sortOrder: experience.sortOrder,
      featured: experience.featured,
      featuredSortOrder: experience.featuredSortOrder,
      seoTitle: experience.seoTitle,
      seoDescription: experience.seoDescription,
    }
  })

  return {
    identity: {
      fixtureId: fixture.fixtureId,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
    },
    site: fixture.site,
    siteConfig: fixture.siteConfig.map((entry) => ({ ...entry })),
    siteLocales: fixture.siteLocales.map((entry) => ({ ...entry })),
    siteDomains: fixture.siteDomains.map((entry) => ({ ...entry })),
    locations: fixture.locations.map((location) => ({ ...location })),
    mediaAssets,
    siteContent,
    experiences,
    publicRoutes: fixture.publicRoutes.map((route) => ({ ...route })),
    routeManifest: {
      locations: fixture.locations.map((location) => `/locations/${location.slug}`),
      experiences: fixture.experiences.map((experience) => `/experiences/${experience.slug}`),
    },
  }
}
