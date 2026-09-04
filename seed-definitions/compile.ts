import type {
  CompiledSeedBusinessLocationTranslation,
  CompiledCuratedSiteBundle,
  CompiledSeedExperience,
  CompiledSeedLocationQa,
  CompiledSeedMediaAsset,
  CompiledSeedProduct,
  CompiledSeedPost,
  CompiledSeedPostChannelJob,
  CompiledSeedReview,
  CompiledSeedTenantPageContent,
  CompiledSeedTenantPageLocaleField,
  CuratedSiteDefinition,
} from './contracts.ts'

function uniqueStrings(values: string[], label: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(`Duplicate ${label} values are not allowed`)
  }
}

function validateMedia<Slot extends string>(media: Array<{ asset_id: string; slot: Slot }>, mediaIds: Set<string>, label: string) {
  uniqueStrings(media.map(item => `${item.slot}:${item.asset_id}`), `${label} media placement`)
  for (const item of media) {
    if (!mediaIds.has(item.asset_id)) {
      throw new Error(`${label} references unknown media asset "${item.asset_id}"`)
    }
  }
  return media.map(item => ({ ...item }))
}

export function compileCuratedSiteFixture(
  fixture: CuratedSiteDefinition,
): CompiledCuratedSiteBundle {
  const locationIds = new Set(fixture.locations.map((l) => l.id))
  const mediaIds = new Set(fixture.mediaAssets.map((a) => a.id))
  const siteLocaleIds = new Set(fixture.siteLocales.map((l) => l.locale))

  uniqueStrings(fixture.locations.map((l) => l.id), 'location id')
  uniqueStrings(fixture.locations.map((l) => l.slug), 'location slug')
  uniqueStrings(fixture.siteLocales.map((l) => l.id), 'site locale id')
  uniqueStrings(fixture.siteLocales.map((l) => l.locale), 'site locale')
  uniqueStrings(fixture.siteDomains.map((d) => d.id), 'site domain id')
  uniqueStrings(fixture.siteDomains.map((d) => d.domain), 'site domain')
  uniqueStrings(fixture.mediaAssets.map((a) => a.id), 'media asset id')
  uniqueStrings(fixture.mediaAssets.map((a) => a.fileName), 'media asset file name')
  uniqueStrings(fixture.tenantPageContent.map((e) => e.id), 'tenant page content id')
  uniqueStrings(fixture.experiences.map((e) => e.id), 'experience id')
  uniqueStrings(fixture.experiences.map((e) => e.slug), 'experience slug')
  uniqueStrings(fixture.reviews.map((r) => r.id), 'review id')
  uniqueStrings(fixture.products.map((product) => product.id), 'Product id')
  uniqueStrings(fixture.products.map((product) => `${product.locationId}:${product.slug}`), 'location Product slug')
  uniqueStrings(fixture.locationQa.map((q) => q.id), 'location qa id')
  uniqueStrings(fixture.posts.map((p) => p.id), 'post id')
  uniqueStrings(fixture.posts.flatMap((p) => p.channelJobs.map((j) => j.id)), 'post channel job id')
  uniqueStrings((fixture.tenantPageLocaleFields ?? []).map((entry) => entry.id), 'tenant page locale field id')
  uniqueStrings((fixture.businessLocationTranslations ?? []).map((entry) => entry.id), 'business location translation id')
  uniqueStrings(fixture.publicRoutes.map((r) => r.path), 'public route path')

  const validatedSiteMedia = validateMedia(fixture.site.media, mediaIds, 'Site')
  const validatedLocationMediaById = new Map(
    fixture.locations.map((location) => [location.id, validateMedia(location.media, mediaIds, `Location "${location.id}"`)]),
  )

  const sourceLocales = fixture.siteLocales.filter((locale) => locale.isSource)
  if (sourceLocales.length !== 1) {
    throw new Error(`Fixture must declare exactly one source locale; found ${sourceLocales.length}`)
  }
  const sourceLocale = sourceLocales[0]!.locale
  if (sourceLocales[0]!.status !== 'published') {
    throw new Error(`Source locale "${sourceLocale}" must be published`)
  }

  const mediaAssets: CompiledSeedMediaAsset[] = fixture.mediaAssets.map((asset) => {
    if (asset.kind === 'video' && !asset.thumbnailUrl.trim()) {
      throw new Error(`Video media asset "${asset.id}" requires thumbnailUrl`)
    }
    const common = {
      id: asset.id,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      provider: asset.provider ?? 'cloudflare_r2',
      source: asset.source ?? 'uploaded',
      r2Key: asset.r2Key ?? null,
      cloudflareImageId: asset.cloudflareImageId ?? null,
      publicUrl: asset.publicUrl,
      mimeType: asset.mimeType,
      fileName: asset.fileName,
      altText: asset.altText,
      category: asset.category,
      status: 'active' as const,
    }
    if (asset.kind === 'video') {
      return { ...common, kind: 'video', thumbnailUrl: asset.thumbnailUrl }
    }
    return { ...common, kind: 'image', thumbnailUrl: asset.thumbnailUrl }
  })

  const tenantPageContent: CompiledSeedTenantPageContent[] = fixture.tenantPageContent.map((entry) => {
    if (entry.locationId && !locationIds.has(entry.locationId)) {
      throw new Error(`Tenant page content "${entry.id}" references unknown location "${entry.locationId}"`)
    }
    const media = validateMedia(entry.media, mediaIds, `Tenant page content "${entry.id}"`)
    return {
      id: entry.id,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      locationId: entry.locationId,
      page: entry.page,
      field: entry.field,
      content: entry.content,
      heroTitle: entry.heroTitle ?? null,
      heroSubtitle: entry.heroSubtitle ?? null,
      media,
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
    const media = validateMedia(experience.media, mediaIds, `Experience "${experience.id}"`)
    return {
      id: experience.id,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      locationId: experience.locationId,
      title: experience.title,
      slug: experience.slug,
      tagline: experience.tagline,
      body: experience.body,
      media,
      highlights: experience.highlights ?? null,
      includedItems: experience.includedItems ?? null,
      whatToBring: experience.whatToBring ?? null,
      meetingPoint: experience.meetingPoint ?? null,
      cancellationPolicy: experience.cancellationPolicy ?? null,
      price: experience.price,
      priceAmount: experience.priceAmount,
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

  const reviews: CompiledSeedReview[] = fixture.reviews.map((review) => {
    if (!locationIds.has(review.locationId)) {
      throw new Error(`Review "${review.id}" references unknown location "${review.locationId}"`)
    }
    return {
      id: review.id,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      locationId: review.locationId,
      authorName: review.authorName,
      rating: review.rating,
      content: review.content,
      ownerReply: review.ownerReply,
      ownerReplyAt: review.ownerReplyAt,
      status: review.status,
      source: review.source,
    }
  })

  const products: CompiledSeedProduct[] = fixture.products.map((product) => {
    if (!locationIds.has(product.locationId)) {
      throw new Error(`Product "${product.id}" references unknown location "${product.locationId}"`)
    }
    return {
      id: product.id,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      locationId: product.locationId,
      category: product.category,
      name: product.name,
      slug: product.slug,
      description: product.description,
      priceAmount: product.priceAmount,
      media: validateMedia(product.media, mediaIds, `Product "${product.id}"`),
      allergens: product.allergens,
      dietaryNotes: product.dietaryNotes,
      available: product.available,
      sortOrder: product.sortOrder,
      featured: product.featured ?? false,
      featuredSortOrder: product.featuredSortOrder ?? 0,
    }
  })

  const locationQa: CompiledSeedLocationQa[] = fixture.locationQa.map((qa) => {
    if (!locationIds.has(qa.locationId)) {
      throw new Error(`Location Q&A "${qa.id}" references unknown location "${qa.locationId}"`)
    }
    return {
      id: qa.id,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      locationId: qa.locationId,
      question: qa.question,
      questionAuthor: qa.questionAuthor,
      answer: qa.answer,
      answerAuthor: qa.answerAuthor,
      isOwnerAnswer: qa.isOwnerAnswer,
      upvoteCount: qa.upvoteCount,
      source: qa.source,
      status: qa.status,
      sortOrder: qa.sortOrder,
    }
  })

  const posts: CompiledSeedPost[] = fixture.posts.map((post) => {
    if (post.locationId && !locationIds.has(post.locationId)) {
      throw new Error(`Post "${post.id}" references unknown location "${post.locationId}"`)
    }
    const media = validateMedia(post.media, mediaIds, `Post "${post.id}"`)
    const channelJobs: CompiledSeedPostChannelJob[] = post.channelJobs.map((job) => ({
      id: job.id,
      postId: post.id,
      organizationId: fixture.organizationId,
      channel: job.channel,
      status: job.status,
      publishedAt: job.publishedAt,
    }))
    return {
      id: post.id,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      locationId: post.locationId,
      postType: post.postType,
      title: post.title,
      body: post.body,
      media,
      status: post.status,
      publishedAt: post.publishedAt,
      createdBy: post.createdBy,
      channelJobs,
    }
  })

  const tenantPageLocaleFields: CompiledSeedTenantPageLocaleField[] = (fixture.tenantPageLocaleFields ?? []).map((entry) => {
    if (entry.locale === sourceLocale) {
      throw new Error(`Tenant page locale field "${entry.id}" must target a non-source locale`)
    }
    if (!siteLocaleIds.has(entry.locale)) {
      throw new Error(`Tenant page locale field "${entry.id}" references unknown locale "${entry.locale}"`)
    }
    if (entry.locationId && !locationIds.has(entry.locationId)) {
      throw new Error(`Tenant page locale field "${entry.id}" references unknown location "${entry.locationId}"`)
    }
    return {
      id: entry.id,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      locationId: entry.locationId,
      locale: entry.locale,
      page: entry.page,
      field: entry.field,
      content: entry.content,
      heroTitle: entry.heroTitle ?? null,
      heroSubtitle: entry.heroSubtitle ?? null,
      value: entry.value,
      type: entry.type,
      status: entry.status,
      sourceHash: entry.sourceHash,
      translatedAt: entry.translatedAt,
      reviewedAt: entry.reviewedAt,
    }
  })

  const businessLocationTranslations: CompiledSeedBusinessLocationTranslation[] = (fixture.businessLocationTranslations ?? []).map((entry) => {
    if (entry.locale === sourceLocale) {
      throw new Error(`Business location translation "${entry.id}" must target a non-source locale`)
    }
    if (!siteLocaleIds.has(entry.locale)) {
      throw new Error(`Business location translation "${entry.id}" references unknown locale "${entry.locale}"`)
    }
    if (!locationIds.has(entry.locationId)) {
      throw new Error(`Business location translation "${entry.id}" references unknown location "${entry.locationId}"`)
    }
    return {
      id: entry.id,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      locationId: entry.locationId,
      locale: entry.locale,
      title: entry.title,
      address: entry.address,
      city: entry.city,
      description: entry.description,
      shortDescription: entry.shortDescription,
      status: entry.status,
      sourceHash: entry.sourceHash,
      translatedAt: entry.translatedAt,
      reviewedAt: entry.reviewedAt,
    }
  })

  return {
    identity: {
      fixtureId: fixture.fixtureId,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
    },
    site: { ...fixture.site, media: validatedSiteMedia },
    siteConfig: fixture.siteConfig.map((entry) => ({ ...entry })),
    siteLocales: fixture.siteLocales.map((entry) => ({ ...entry })),
    siteDomains: fixture.siteDomains.map((entry) => ({ ...entry })),
    locations: fixture.locations.map((location) => ({ ...location, media: validatedLocationMediaById.get(location.id)! })),
    mediaAssets,
    tenantPageContent,
    experiences,
    reviews,
    products,
    locationQa,
    posts,
    tenantPageLocaleFields,
    businessLocationTranslations,
    publicRoutes: fixture.publicRoutes.map((route) => ({ ...route })),
    routeManifest: {
      locations: fixture.locations.map((l) => `/locations/${l.slug}`),
      experiences: fixture.experiences.map((e) => `/experiences/${e.slug}`),
    },
    aiCredits: fixture.aiCredits
      ? { balance: fixture.aiCredits.balance, lifetimeUsed: fixture.aiCredits.lifetimeUsed ?? 0 }
      : undefined,
    organizationBilling: fixture.organizationBilling,
  }
}
