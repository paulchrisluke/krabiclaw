import type {
  CompiledSeedBusinessLocationTranslation,
  CompiledCuratedSiteBundle,
  CompiledSeedExperience,
  CompiledSeedMenuItemTranslation,
  CompiledSeedMenuTranslation,
  CompiledSeedLocationQa,
  CompiledSeedMediaAsset,
  CompiledSeedMenu,
  CompiledSeedMenuItem,
  CompiledSeedPost,
  CompiledSeedPostChannelJob,
  CompiledSeedReview,
  CompiledSeedSiteContent,
  CompiledSeedSiteContentTranslation,
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
  uniqueStrings(fixture.siteContent.map((e) => e.id), 'site content id')
  uniqueStrings(fixture.experiences.map((e) => e.id), 'experience id')
  uniqueStrings(fixture.experiences.map((e) => e.slug), 'experience slug')
  uniqueStrings(fixture.reviews.map((r) => r.id), 'review id')
  uniqueStrings(fixture.menus.map((m) => m.id), 'menu id')
  uniqueStrings(fixture.menus.flatMap((m) => m.items.map((i) => i.id)), 'menu item id')
  uniqueStrings(fixture.locationQa.map((q) => q.id), 'location qa id')
  uniqueStrings(fixture.posts.map((p) => p.id), 'post id')
  uniqueStrings(fixture.posts.flatMap((p) => p.channelJobs.map((j) => j.id)), 'post channel job id')
  uniqueStrings((fixture.siteContentTranslations ?? []).map((entry) => entry.id), 'site content translation id')
  uniqueStrings((fixture.businessLocationTranslations ?? []).map((entry) => entry.id), 'business location translation id')
  uniqueStrings((fixture.menuTranslations ?? []).map((entry) => entry.id), 'menu translation id')
  uniqueStrings((fixture.menuItemTranslations ?? []).map((entry) => entry.id), 'menu item translation id')
  uniqueStrings(fixture.publicRoutes.map((r) => r.path), 'public route path')

  const mediaAssets: CompiledSeedMediaAsset[] = fixture.mediaAssets.map((asset) => {
    if (asset.locationId && !locationIds.has(asset.locationId)) {
      throw new Error(`Media asset "${asset.id}" references unknown location "${asset.locationId}"`)
    }
    return {
      id: asset.id,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      locationId: asset.locationId,
      kind: asset.kind ?? 'image',
      provider: asset.provider ?? 'external_url',
      source: asset.source ?? 'external',
      r2Key: asset.r2Key ?? null,
      cloudflareImageId: asset.cloudflareImageId ?? null,
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
    if (entry.heroImageAssetId && !mediaIds.has(entry.heroImageAssetId)) {
      throw new Error(`Site content "${entry.id}" references unknown hero image asset "${entry.heroImageAssetId}"`)
    }
    if (entry.heroVideoAssetId && !mediaIds.has(entry.heroVideoAssetId)) {
      throw new Error(`Site content "${entry.id}" references unknown hero video asset "${entry.heroVideoAssetId}"`)
    }
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
      heroImageAssetId: entry.heroImageAssetId ?? null,
      heroVideoAssetId: entry.heroVideoAssetId ?? null,
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
      reviewerPhotoUrl: review.reviewerPhotoUrl,
      rating: review.rating,
      content: review.content,
      ownerReply: review.ownerReply,
      ownerReplyAt: review.ownerReplyAt,
      status: review.status,
      source: review.source,
    }
  })

  const menus: CompiledSeedMenu[] = fixture.menus.map((menu) => {
    if (!locationIds.has(menu.locationId)) {
      throw new Error(`Menu "${menu.id}" references unknown location "${menu.locationId}"`)
    }
    const items: CompiledSeedMenuItem[] = menu.items.map((item) => {
      if (item.imageAssetId && !mediaIds.has(item.imageAssetId)) {
        throw new Error(`Menu item "${item.id}" references unknown image asset "${item.imageAssetId}"`)
      }
      return {
        id: item.id,
        menuId: menu.id,
        organizationId: fixture.organizationId,
        siteId: fixture.siteId,
        section: item.section,
        name: item.name,
        slug: item.slug,
        description: item.description,
        priceAmount: item.priceAmount,
        imageAssetId: item.imageAssetId,
        allergens: item.allergens,
        dietaryNotes: item.dietaryNotes,
        available: item.available,
        sortOrder: item.sortOrder,
      }
    })
    return {
      id: menu.id,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      locationId: menu.locationId,
      name: menu.name,
      description: menu.description,
      sectionOrder: [...menu.sectionOrder],
      status: menu.status,
      items,
    }
  })

  const menuIds = new Set(menus.map((menu) => menu.id))
  const menuItemIds = new Set(menus.flatMap((menu) => menu.items.map((item) => item.id)))

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
    if (post.imageAssetId && !mediaIds.has(post.imageAssetId)) {
      throw new Error(`Post "${post.id}" references unknown image asset "${post.imageAssetId}"`)
    }
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
      imageAssetId: post.imageAssetId,
      status: post.status,
      publishedAt: post.publishedAt,
      createdBy: post.createdBy,
      channelJobs,
    }
  })

  const siteContentTranslations: CompiledSeedSiteContentTranslation[] = (fixture.siteContentTranslations ?? []).map((entry) => {
    if (!siteLocaleIds.has(entry.locale)) {
      throw new Error(`Site content translation "${entry.id}" references unknown locale "${entry.locale}"`)
    }
    if (entry.locationId && !locationIds.has(entry.locationId)) {
      throw new Error(`Site content translation "${entry.id}" references unknown location "${entry.locationId}"`)
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

  const menuTranslations: CompiledSeedMenuTranslation[] = (fixture.menuTranslations ?? []).map((entry) => {
    if (!siteLocaleIds.has(entry.locale)) {
      throw new Error(`Menu translation "${entry.id}" references unknown locale "${entry.locale}"`)
    }
    if (!menuIds.has(entry.menuId)) {
      throw new Error(`Menu translation "${entry.id}" references unknown menu "${entry.menuId}"`)
    }
    return {
      id: entry.id,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      menuId: entry.menuId,
      locale: entry.locale,
      name: entry.name,
      description: entry.description,
      sectionOrder: entry.sectionOrder ? [...entry.sectionOrder] : null,
      status: entry.status,
      sourceHash: entry.sourceHash,
      translatedAt: entry.translatedAt,
      reviewedAt: entry.reviewedAt,
    }
  })

  const menuItemTranslations: CompiledSeedMenuItemTranslation[] = (fixture.menuItemTranslations ?? []).map((entry) => {
    if (!siteLocaleIds.has(entry.locale)) {
      throw new Error(`Menu item translation "${entry.id}" references unknown locale "${entry.locale}"`)
    }
    if (!menuItemIds.has(entry.menuItemId)) {
      throw new Error(`Menu item translation "${entry.id}" references unknown menu item "${entry.menuItemId}"`)
    }
    return {
      id: entry.id,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      menuItemId: entry.menuItemId,
      locale: entry.locale,
      section: entry.section,
      name: entry.name,
      description: entry.description,
      allergens: entry.allergens,
      dietaryNotes: entry.dietaryNotes,
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
    site: fixture.site,
    siteConfig: fixture.siteConfig.map((entry) => ({ ...entry })),
    siteLocales: fixture.siteLocales.map((entry) => ({ ...entry })),
    siteDomains: fixture.siteDomains.map((entry) => ({ ...entry })),
    locations: fixture.locations.map((location) => ({ ...location })),
    mediaAssets,
    siteContent,
    experiences,
    reviews,
    menus,
    locationQa,
    posts,
    siteContentTranslations,
    businessLocationTranslations,
    menuTranslations,
    menuItemTranslations,
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
