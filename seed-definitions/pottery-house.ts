import { compileCuratedSiteFixture } from './compile.ts'
import type { CuratedSiteDefinition } from './contracts.ts'

function escapeSql(value: string): string {
  return value.replace(/'/g, "''")
}

function sqlValue(value: string | number | boolean | null): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${escapeSql(value)}'`
}

function sqlJson(value: unknown): string {
  return sqlValue(JSON.stringify(value))
}

export const potteryHouseFixture: CuratedSiteDefinition = {
  fixtureId: 'pottery-house',
  organizationId: 'org-pottery-house',
  siteId: 'site-pottery-house',
  site: {
    slug: 'pottery-house-krabi',
    subdomain: 'pottery-house',
    brandName: 'Pottery House Krabi',
    themeId: 'saya-theme-v1',
    theme: 'saya',
    brandDescription:
      'A creative pottery studio in Krabi, Thailand. Wheel throwing classes, handbuilding workshops, Cocktails & Clay nights, and a beachfront popup. Clay, calm, and a place to return to each week.',
    status: 'active',
    plan: 'free',
    onboardingStatus: 'active',
    urlStructure: 'location_subdirectories',
    primaryLocationId: 'loc-pottery-house',
    contactEmail: 'thesdrew@gmail.com',
    contactPhone: '+66626505890',
    defaultCurrency: 'THB',
    vertical: 'experience',
    contentSource: 'google_maps',
    mediaSource: 'client_photos',
  },
  siteConfig: [
    { key: 'source_locale', value: 'en' },
  ],
  siteLocales: [
    {
      id: 'locale::org-pottery-house::site-pottery-house::en',
      locale: 'en',
      label: 'English',
      isSource: true,
      status: 'published',
      fallbackEnabled: true,
    },
    {
      id: 'locale::org-pottery-house::site-pottery-house::th',
      locale: 'th',
      label: 'ไทย',
      isSource: false,
      status: 'published',
      fallbackEnabled: true,
    },
  ],
  siteDomains: [
    {
      id: 'domain-pottery-local',
      domain: 'pottery-house.localhost',
      type: 'subdomain',
      role: 'secondary',
      status: 'active',
      dnsStatus: 'valid',
    },
    {
      id: 'domain-pottery-prod',
      domain: 'pottery-house.krabiclaw.com',
      type: 'subdomain',
      role: 'canonical',
      status: 'active',
      dnsStatus: 'valid',
    },
  ],
  locations: [
    {
      id: 'loc-pottery-house',
      slug: 'krabi',
      title: 'Pottery House Krabi',
      city: 'Krabi',
      address: {
        addressLines: [''],
        locality: 'Krabi',
        administrativeArea: 'Krabi',
        postalCode: '81000',
        country: 'TH',
      },
      phone: '+66626505890',
      email: 'bamboo.chow@gmail.com',
      mapsUrl: 'https://maps.app.goo.gl/pottery-house-krabi',
      latitude: 8.0557285,
      longitude: 98.7504791,
      description:
        'Pottery House is a creative studio in Krabi where you can throw on the wheel, build by hand, glaze your pieces, and take something real home with you. All materials and firing are included. Whether you are a first-timer, a returning traveller, or someone looking for a slow creative routine while staying in Krabi, you are welcome here.',
      shortDescription:
        'Wheel throwing, handbuilding, and glazing classes in the heart of Krabi. All materials and firing included.',
      openingHours: [
        { openDay: 'TUESDAY', openTime: '10:00', closeTime: '18:00' },
        { openDay: 'WEDNESDAY', openTime: '10:00', closeTime: '18:00' },
        { openDay: 'THURSDAY', openTime: '10:00', closeTime: '18:00' },
        { openDay: 'FRIDAY', openTime: '10:00', closeTime: '22:00' },
        { openDay: 'SATURDAY', openTime: '10:00', closeTime: '18:00' },
        { openDay: 'SUNDAY', openTime: '10:00', closeTime: '18:00' },
      ],
      rating: 4.9,
      reviewCount: 74,
      priceLevel: '฿฿',
      categories: ['Pottery Studio', 'Pottery Classes', 'Ceramic Workshop', 'Art Experience'],
      instagramUrl: 'https://instagram.com/potteryclasseskrabi',
      facebookUrl: '',
      isPrimary: true,
      status: 'active',
      heroImageAssetId: 'media-ph-homepage-custom',
    },
    {
      id: 'loc-pottery-beachfront',
      slug: 'klong-muang-beach',
      title: 'Pottery House — Beachfront at Klong Muang',
      city: 'Krabi',
      address: {
        addressLines: ['Sea View, Klong Muang'],
        locality: 'Krabi',
        administrativeArea: 'Krabi',
        postalCode: '81000',
        country: 'TH',
      },
      phone: '+66626505890',
      email: 'bamboo.chow@gmail.com',
      mapsUrl:
        'https://www.google.com/maps/place/Beachfront+Pottery+Krabi/@8.0556415,98.7476018,17z/data=!4m7!3m6!1s0x3051bf001b03f635:0xafb40b8ba3d4f053!8m2!3d8.057425!4d98.7486163!15sCgdwb3R0ZXJ5WgkiB3BvdHRlcnmSAQ9wb3R0ZXJ5X2NsYXNzZXOaAURDaTlEUVVsUlFVTnZaRU5vZEhsalJqbHZUMnQwZEdJeWNHaFRNRFI1VkZaV2ExWlZXakZWYkVJeFUxZHdURTVYWXhBQuABAPoBBAhYEDg!16s%2Fg%2F11yfvr97vw?entry=tts&g_ep=EgoyMDI2MDUyNS4wIPu8ASoASAFQAw%3D%3D&skid=1d6266f5-0075-4577-a084-27409b012140',
      latitude: 8.057425,
      longitude: 98.7486163,
      description:
        'A pop-up beachfront pottery session at Sea View, Klong Muang. Throw on the wheel with the Gulf of Thailand in front of you. Limited seats, unforgettable setting.',
      shortDescription: 'Beachfront wheel throwing sessions at Klong Muang beach. Limited seats.',
      openingHours: [
        { openDay: 'MONDAY', openTime: '12:00', closeTime: '19:30' },
        { openDay: 'TUESDAY', openTime: '12:00', closeTime: '19:30' },
        { openDay: 'WEDNESDAY', openTime: '12:00', closeTime: '19:30' },
        { openDay: 'THURSDAY', openTime: '12:00', closeTime: '19:30' },
        { openDay: 'FRIDAY', openTime: '12:00', closeTime: '19:30' },
        { openDay: 'SATURDAY', openTime: '12:00', closeTime: '19:30' },
        { openDay: 'SUNDAY', openTime: '12:00', closeTime: '19:30' },
      ],
      rating: 4.9,
      reviewCount: 18,
      priceLevel: '฿฿',
      categories: ['Pottery Studio', 'Beachfront Experience', 'Pottery Classes'],
      instagramUrl: 'https://instagram.com/potteryclasseskrabi',
      // Facebook Place ID stored in this field for the beachfront location
      facebookUrl: 'ChIJNfYDGwC_UTARU_DUo4sLtK8',
      isPrimary: false,
      status: 'active',
      heroImageAssetId: 'media-ph-beach-hero',
    },
  ],
  mediaAssets: [
    // Cloudflare R2 uploads — synced with production (2026-06-09)
    {
      id: 'media-ph-homepage-custom',
      locationId: 'loc-pottery-house',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2Key: 'sites/site-pottery-house/media/620a54b7-33ef-48b9-b5d3-0b3a5a22be13.png',
      publicUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/620a54b7-33ef-48b9-b5d3-0b3a5a22be13.png',
      thumbnailUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/620a54b7-33ef-48b9-b5d3-0b3a5a22be13.png',
      mimeType: 'image/png',
      fileName: '620a54b7-33ef-48b9-b5d3-0b3a5a22be13.png',
      altText: 'Homepage hero',
      category: 'exterior',
    },
    {
      id: 'media-ph-beach-hero',
      locationId: 'loc-pottery-beachfront',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2Key: 'sites/site-pottery-house/media/862ac356-bc0f-40b1-a8e6-0395fe183c3d.png',
      publicUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/862ac356-bc0f-40b1-a8e6-0395fe183c3d.png',
      thumbnailUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/862ac356-bc0f-40b1-a8e6-0395fe183c3d.png',
      mimeType: 'image/png',
      fileName: '862ac356-bc0f-40b1-a8e6-0395fe183c3d.png',
      altText: 'Beachfront location hero',
      category: 'exterior',
    },
    {
      id: 'media-ph-krabi-hero',
      locationId: 'loc-pottery-house',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2Key: 'sites/site-pottery-house/media/38945199-c3bb-4a0b-8e24-6d2f09ab3fd5.png',
      publicUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/38945199-c3bb-4a0b-8e24-6d2f09ab3fd5.png',
      thumbnailUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/38945199-c3bb-4a0b-8e24-6d2f09ab3fd5.png',
      mimeType: 'image/png',
      fileName: '38945199-c3bb-4a0b-8e24-6d2f09ab3fd5.png',
      altText: 'Krabi location hero',
      category: 'exterior',
    },
    {
      id: 'media-ph-about-custom',
      locationId: 'loc-pottery-house',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2Key: 'sites/site-pottery-house/media/262e7084-30b8-48c6-94b9-1ba60664666c.png',
      publicUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/262e7084-30b8-48c6-94b9-1ba60664666c.png',
      thumbnailUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/262e7084-30b8-48c6-94b9-1ba60664666c.png',
      mimeType: 'image/png',
      fileName: '262e7084-30b8-48c6-94b9-1ba60664666c.png',
      altText: 'About page image',
      category: 'other',
    },
    {
      id: 'media-ph-beachfront',
      locationId: 'loc-pottery-beachfront',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2Key: 'sites/site-pottery-house/media/WhatsApp-Image-2026-05-28-at-09.17.56.jpeg',
      publicUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/WhatsApp-Image-2026-05-28-at-09.17.56.jpeg',
      thumbnailUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/WhatsApp-Image-2026-05-28-at-09.17.56.jpeg',
      mimeType: 'image/jpeg',
      fileName: 'WhatsApp-Image-2026-05-28-at-09.17.56.jpeg',
      altText: 'Beachfront pottery',
      category: 'exterior',
    },
    {
      id: 'media-ph-cocktails',
      locationId: 'loc-pottery-house',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2Key: 'sites/site-pottery-house/media/705340249_1010726131467629_3263381692626801997_n.png',
      publicUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/705340249_1010726131467629_3263381692626801997_n.png',
      thumbnailUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/705340249_1010726131467629_3263381692626801997_n.png',
      mimeType: 'image/png',
      fileName: '705340249_1010726131467629_3263381692626801997_n.png',
      altText: 'Cocktails & Clay',
      category: 'other',
    },
    {
      id: 'media-ph-membership',
      locationId: 'loc-pottery-house',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2Key: 'sites/site-pottery-house/media/WhatsApp-Image-2026-05-28-at-18.33.09.jpeg',
      publicUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/WhatsApp-Image-2026-05-28-at-18.33.09.jpeg',
      thumbnailUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/WhatsApp-Image-2026-05-28-at-18.33.09.jpeg',
      mimeType: 'image/jpeg',
      fileName: 'WhatsApp-Image-2026-05-28-at-18.33.09.jpeg',
      altText: 'Monthly membership',
      category: 'other',
    },
    // Migrated Cloudflare Images records
    {
      id: 'media-ph-hero',
      locationId: 'loc-pottery-house',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: 'd4a4f779-5c53-4833-1e60-f28290afb200',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/d4a4f779-5c53-4833-1e60-f28290afb200/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/d4a4f779-5c53-4833-1e60-f28290afb200/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'pottery-house-hero.png',
      altText: 'Pottery House Krabi studio exterior with hanging greenery and warm lights',
      category: 'exterior',
    },
    {
      id: 'media-ph-studio',
      locationId: 'loc-pottery-house',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: '3a61ea95-852b-47c3-f0c7-2da69e130000',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/3a61ea95-852b-47c3-f0c7-2da69e130000/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/3a61ea95-852b-47c3-f0c7-2da69e130000/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'pottery-house-studio.jpg',
      altText: 'Pottery House Krabi studio with dark walls, hanging greenery and shelves of handmade ceramics',
      category: 'interior',
    },
    {
      id: 'media-ph-team',
      locationId: 'loc-pottery-house',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: '041e17a5-4394-4a85-3933-37ef29809400',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/041e17a5-4394-4a85-3933-37ef29809400/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/041e17a5-4394-4a85-3933-37ef29809400/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'pottery-house-team.jpg',
      altText: 'Pottery House Krabi team with handmade pottery on shelves behind them',
      category: 'team',
    },
    {
      id: 'media-ph-wheel',
      locationId: 'loc-pottery-house',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2Key: 'sites/site-pottery-house/media/pottery-wheel-class.jpg',
      publicUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/pottery-wheel-class.jpg',
      thumbnailUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/pottery-wheel-class.jpg',
      mimeType: 'image/jpeg',
      fileName: 'pottery-wheel-class.jpg',
      altText: 'Pottery wheel throwing class at Pottery House Krabi',
      category: 'interior',
    },
    {
      id: 'media-ph-ceramics',
      locationId: 'loc-pottery-house',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: 'aee28525-66b4-40d5-3424-c936e6e21d00',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/aee28525-66b4-40d5-3424-c936e6e21d00/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/aee28525-66b4-40d5-3424-c936e6e21d00/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'pottery-ceramics-display.jpg',
      altText: 'Display of handmade ceramics, cups, plates and vases at Pottery House Krabi',
      category: 'food',
    },
    {
      id: 'media-ph-kiln',
      locationId: 'loc-pottery-house',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: 'af4c4c0c-691c-4e7a-ce96-78a4c89b5b00',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/af4c4c0c-691c-4e7a-ce96-78a4c89b5b00/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/af4c4c0c-691c-4e7a-ce96-78a4c89b5b00/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'pottery-kiln.jpg',
      altText: 'Professional kiln at Pottery House Krabi for bisque and glaze firing',
      category: 'interior',
    },
    {
      id: 'media-ph-cocktails-clay',
      locationId: 'loc-pottery-house',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: 'f6c35118-aba6-4cc7-22c5-9f1f3a227a00',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/f6c35118-aba6-4cc7-22c5-9f1f3a227a00/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/f6c35118-aba6-4cc7-22c5-9f1f3a227a00/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'cocktails-and-clay.jpg',
      altText: 'Cocktails and Clay Friday night event at Pottery House Krabi',
      category: 'interior',
    },
    {
      id: 'media-ph-beach',
      locationId: 'loc-pottery-beachfront',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflareImageId: 'ee0b0d31-c328-43f9-0371-2431da63b100',
      publicUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/ee0b0d31-c328-43f9-0371-2431da63b100/public',
      thumbnailUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/ee0b0d31-c328-43f9-0371-2431da63b100/thumbnail',
      mimeType: 'image/jpeg',
      fileName: 'klong-muang-beachfront.jpg',
      altText: 'Beachfront pottery session at Klong Muang with Gulf of Thailand view',
      category: 'exterior',
    },
    {
      id: 'media-ph-post1',
      locationId: 'loc-pottery-house',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2Key: 'sites/site-pottery-house/media/post-wheel.jpg',
      publicUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/post-wheel.jpg',
      thumbnailUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/post-wheel.jpg',
      mimeType: 'image/jpeg',
      fileName: 'post-wheel.jpg',
      altText: 'Pottery wheel class at Pottery House Krabi',
      category: 'interior',
    },
    {
      id: 'media-ph-post2',
      locationId: 'loc-pottery-house',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2Key: 'sites/site-pottery-house/media/post-team.jpg',
      publicUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/post-team.jpg',
      thumbnailUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/post-team.jpg',
      mimeType: 'image/jpeg',
      fileName: 'post-team.jpg',
      altText: 'Pottery House Krabi team',
      category: 'team',
    },
    {
      id: 'media-ph-post3',
      locationId: 'loc-pottery-house',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2Key: 'sites/site-pottery-house/media/post-cocktails.jpg',
      publicUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/post-cocktails.jpg',
      thumbnailUrl: 'https://media.krabiclaw.com/sites/site-pottery-house/media/post-cocktails.jpg',
      mimeType: 'image/jpeg',
      fileName: 'post-cocktails.jpg',
      altText: 'Cocktails and Clay Friday event',
      category: 'interior',
    },
  ],
  siteContent: [
    {
      id: 'sc-ph-home-hero',
      locationId: null,
      page: 'home',
      field: 'hero',
      content: null,
      heroTitle: 'Clay, calm, and a place to return to.',
      heroSubtitle: 'Pottery classes, wheel throwing & handbuilding in Krabi, Thailand.',
      heroImageAssetId: 'media-ph-homepage-custom',
      type: 'text',
      source: 'manual',
    },
    {
      id: 'sc-ph-cta',
      locationId: null,
      page: 'home',
      field: 'cta.title',
      content: 'Book your first class.',
      heroImageAssetId: 'media-ph-homepage-custom',
      type: 'text',
      source: 'manual',
    },
    {
      id: 'sc-ph-story-image',
      locationId: null,
      page: 'about',
      field: 'story.image',
      content: null,
      heroImageAssetId: 'media-ph-team',
      type: 'media',
      source: 'manual',
    },
    {
      id: 'sc-ph-story-title',
      locationId: null,
      page: 'about',
      field: 'story.title',
      content: 'A studio shaped by the joy of making.',
      type: 'text',
      source: 'manual',
    },
    {
      id: 'sc-ph-story-body',
      locationId: null,
      page: 'about',
      field: 'story.body',
      content:
        'Pottery House started with two potters, a pair of wheels, and a belief that making something with your hands changes the way you feel about a day.\n\nWe set up in Krabi because it already pulls people in — travellers who slow down, stay longer, and start looking for something to do with their time that is not just a tour. Clay turned out to be exactly that.\n\nToday the studio is a proper home for ceramics: wheels, a kiln, handbuilding tables, studio glazes, and a beachfront pop-up at Klong Muang when the tides are right. But the feeling is the same as day one. We want you to leave with something you made, something you are proud of, and maybe a reason to come back.',
      type: 'richtext',
      source: 'manual',
    },
    {
      id: 'sc-ph-journey',
      locationId: null,
      page: 'about',
      field: 'journey.body',
      content:
        'We teach proper technique, not just guided hand-holding. Centering, opening, pulling — the mechanics matter because they are what let you make something that actually works. Our instructors adapt to where you are, whether that is your first time touching clay or your hundredth.\n\nAll firing happens on site in our Skutt kiln. Bisque and glaze firing are always included.',
      type: 'textarea',
      source: 'manual',
    },
    {
      id: 'sc-ph-experience',
      locationId: null,
      page: 'about',
      field: 'experience.body',
      content:
        'Come for a single class, come back for Cocktails & Clay, or settle in with a monthly membership. Pottery House is as casual or as serious as you want it to be.\n\nNothing makes our team happier than happy students.',
      type: 'textarea',
      source: 'manual',
    },
  ],
  experiences: [
    {
      id: 'exp-ph-wheel',
      locationId: 'loc-pottery-house',
      title: 'Pottery Wheel Class',
      slug: 'pottery-wheel-class',
      tagline: 'Shape something beautiful. All levels welcome.',
      body:
        'Our signature wheel throwing class is perfect for beginners and returning students alike. You will learn to centre clay, open and pull a cylinder, and shape your piece with guidance from our instructors every step of the way.\n\nAll clay, tools, and firing are included. Your finished pieces are bisque-fired and glaze-fired in our kiln and ready to collect approximately 2–3 weeks after your class.\n\nWhat to expect:\n- 1 hour 30 minutes of hands-on wheel time\n- All materials included (clay, tools, apron)\n- Bisque firing and glaze firing included\n- Studio glazes available to choose from\n- Pieces ready to collect in 2–3 weeks (or shipped home)',
      imageAssetId: 'media-ph-wheel',
      price: '฿1,200',
      durationMinutes: 90,
      maxCapacity: 8,
      timeSlots: ['10:00', '12:00', '14:00', '16:00'],
      availableNote: 'Book online or message us on Instagram @potteryclasseskrabi',
      status: 'active',
      sortOrder: 1,
      featured: true,
      featuredSortOrder: 1,
      seoTitle: 'Pottery Wheel Class Krabi — Pottery House',
      seoDescription:
        'Join a pottery wheel throwing class at Pottery House Krabi. All materials and firing included. Perfect for beginners and returning students in Krabi, Thailand.',
    },
    {
      id: 'exp-ph-cocktails',
      locationId: 'loc-pottery-house',
      title: 'Cocktails & Clay',
      slug: 'cocktails-and-clay',
      tagline: 'Friday nights. Wheels spinning. Drinks flowing.',
      body:
        'Cocktails & Clay is our Friday night social — a relaxed and fun way to try pottery with friends while enjoying a drink or two.\n\nYou get a full wheel throwing session with instructor support, and we take care of the good vibes. Bisque and glaze firing are included, so your creation gets the full kiln treatment just like in any daytime class.\n\nPerfect for couples, groups, date nights, and solo travellers looking for a fun evening out in Krabi.\n\nWhat is included:\n- 3 hours of wheel time and handbuilding\n- Drinks available at the studio\n- All clay, aprons, and tools provided\n- Bisque firing and glaze firing included\n- Pieces ready in 2–3 weeks',
      imageAssetId: 'media-ph-cocktails',
      price: '฿1,500',
      durationMinutes: 180,
      maxCapacity: 12,
      timeSlots: ['19:00'],
      availableNote: 'Every Friday, 7PM to 10PM. Book in advance as spots fill quickly.',
      status: 'active',
      sortOrder: 2,
      featured: true,
      featuredSortOrder: 2,
      seoTitle: 'Cocktails & Clay Friday Night — Pottery House Krabi',
      seoDescription:
        'Cocktails & Clay every Friday 7PM–10PM at Pottery House Krabi. A social pottery evening with drinks, wheels, and good company.',
    },
    {
      id: 'exp-ph-beachfront',
      locationId: 'loc-pottery-beachfront',
      title: 'Beachfront Pottery',
      slug: 'beachfront-pottery',
      tagline: 'Throw on the wheel with the sea in front of you.',
      body:
        'Our beachfront pottery popup at Sea View, Klong Muang is one of a kind. We set up the wheels right by the Gulf of Thailand so you can shape clay while watching long-tail boats drift past.\n\nSeats are extremely limited at this location. Each session is an intimate, unhurried experience guided by our instructor.\n\nAll materials and firing included — your piece travels back to the studio kiln and is ready to collect or ship within 2–3 weeks.\n\nGood for:\n- Hotel guests staying in Klong Muang or Tubkaek\n- Couples looking for a unique Krabi experience\n- Anyone who wants to make something by the sea',
      imageAssetId: 'media-ph-beachfront',
      price: '฿1,800',
      durationMinutes: 120,
      maxCapacity: 4,
      timeSlots: ['09:00', '15:00'],
      availableNote: 'Available on selected days. Message us on Instagram @potteryclasseskrabi to check availability.',
      status: 'active',
      sortOrder: 3,
      featured: true,
      featuredSortOrder: 3,
      seoTitle: 'Beachfront Pottery Class Klong Muang Krabi — Pottery House',
      seoDescription:
        'A unique beachfront pottery experience at Klong Muang beach, Krabi. Limited seats. Wheel throwing with a Gulf of Thailand view. All materials and firing included.',
    },
    {
      id: 'exp-ph-membership',
      locationId: 'loc-pottery-house',
      title: 'Monthly Studio Membership',
      slug: 'monthly-membership',
      tagline: 'Make Pottery House your creative base while you are in Krabi.',
      body:
        'For people staying in Krabi for a month or more, Pottery House can become more than a class. It can become your creative base — a place to practise, meet people, return to unfinished pieces, and feel part of the studio community.\n\nMembership is designed for long-stay visitors, remote workers, expats, and returning guests who want access to the studio beyond a single tourist class.\n\nWhat membership includes:\n- Studio access during agreed member hours\n- Space for handbuilding, practice, and quiet studio time\n- Access to shared tools, work tables, and clay support from the team\n- Storage for works-in-progress while pieces dry and move through firing\n- Clay included (reasonable monthly allowance)\n- Bisque and glaze firing included\n- Studio glazes available (member palette)\n- A chance to meet other makers and feel part of the Pottery House rhythm\n\nAsk us about current member hours, firing schedule, and monthly pricing.',
      imageAssetId: 'media-ph-membership',
      price: 'Ask us',
      durationMinutes: null,
      maxCapacity: null,
      timeSlots: [],
      availableNote:
        'Contact us on Instagram @potteryclasseskrabi or email hello@potteryhoueskrabi.com to discuss membership.',
      status: 'active',
      sortOrder: 4,
      featured: false,
      featuredSortOrder: 0,
      seoTitle: 'Monthly Pottery Studio Membership Krabi — Pottery House',
      seoDescription:
        'Monthly pottery studio membership at Pottery House Krabi. For long-stay visitors, expats, and remote workers. Studio access, tools, storage, and firing included.',
    },
  ],
  reviews: [
    {
      id: 'rev-ph-1',
      locationId: 'loc-pottery-house',
      authorName: 'Sophie L.',
      reviewerPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/45239b3d-625e-49da-e751-a5ff8cc7e700/public',
      rating: 5,
      content:
        'Absolutely loved my wheel class here. The instructor was patient and encouraging — I managed to make an actual bowl on my first try. The studio has such a great vibe, dark walls covered in plants and shelves of beautiful pottery. Already booked my next session.',
      ownerReply: 'Thank you Sophie! See you at the wheel soon.',
      ownerReplyAt: '2026-05-10T09:00:00.000Z',
      status: 'approved',
      source: 'google',
    },
    {
      id: 'rev-ph-2',
      locationId: 'loc-pottery-house',
      authorName: 'Marcus T.',
      reviewerPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/699707fd-1559-4dc9-b115-3fe4a753aa00/public',
      rating: 5,
      content:
        'Cocktails & Clay on Friday night is such a fun concept. Our group of four had a blast — the instructor kept us laughing while actually teaching us proper technique. And the clay somehow ended up all over our faces. 10/10 would recommend.',
      ownerReply: null,
      ownerReplyAt: null,
      status: 'approved',
      source: 'google',
    },
    {
      id: 'rev-ph-3',
      locationId: 'loc-pottery-house',
      authorName: 'Nadia K.',
      reviewerPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/6e004069-4d01-4709-34bd-d1a0cacc4600/public',
      rating: 5,
      content:
        'I did the beachfront session at Klong Muang and it was surreal. Sitting at the wheel with the sea right there, long-tail boats floating past. One of the most memorable things I did in Thailand.',
      ownerReply: 'That setting never gets old for us either. Thank you Nadia!',
      ownerReplyAt: '2026-05-18T14:00:00.000Z',
      status: 'approved',
      source: 'google',
    },
    {
      id: 'rev-ph-4',
      locationId: 'loc-pottery-house',
      authorName: 'James W.',
      reviewerPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/ee18283c-d024-4bf0-15a5-73fc6c321e00/public',
      rating: 4,
      content:
        'Took a wheel class during my second week in Krabi. The instruction is genuinely good — they actually teach you the mechanics of centering rather than just guiding your hands. My piece came out much better than I expected. The 2–3 week turnaround for firing means you need to plan ahead if you want to take it home.',
      ownerReply:
        'Thanks James, and great point about the firing time. We do offer shipping worldwide for guests who cannot wait.',
      ownerReplyAt: '2026-05-05T11:00:00.000Z',
      status: 'approved',
      source: 'google',
    },
    {
      id: 'rev-ph-5',
      locationId: 'loc-pottery-house',
      authorName: 'Camille D.',
      reviewerPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/b010933f-cac7-420f-1b4e-130b3b01ca00/public',
      rating: 5,
      content:
        'I got the monthly membership while working remotely from Krabi for six weeks and it was the best decision. Having a creative routine in the afternoons completely changed how I felt about being away from home. The community here is warm and unpretentious.',
      ownerReply: null,
      ownerReplyAt: null,
      status: 'approved',
      source: 'google',
    },
    {
      id: 'rev-ph-6',
      locationId: 'loc-pottery-house',
      authorName: 'Ryo M.',
      reviewerPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/6413ee7e-ca8d-4616-00f4-8a4224217a00/public',
      rating: 5,
      content:
        'Clay, calm, and a place to return to each week. That is exactly what this place is. Discovered it on a Tuesday and was back on Friday for Cocktails & Clay. The instructor remembered what I was working on. That kind of attention makes a big difference.',
      ownerReply: null,
      ownerReplyAt: null,
      status: 'approved',
      source: 'google',
    },
    {
      id: 'rev-ph-b1',
      locationId: 'loc-pottery-beachfront',
      authorName: 'Anna R.',
      reviewerPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/45239b3d-625e-49da-e751-a5ff8cc7e700/public',
      rating: 5,
      content:
        'The beachfront session is special. I was staying at a resort in Klong Muang and this was the highlight of my whole trip. Four people, one instructor, the Gulf right there. Totally peaceful and strangely meditative.',
      ownerReply: 'Thank you Anna. That little spot is something else.',
      ownerReplyAt: '2026-05-20T10:00:00.000Z',
      status: 'approved',
      source: 'google',
    },
  ],
  menus: [],
  locationQa: [
    {
      id: 'qa-ph-1',
      locationId: 'loc-pottery-house',
      question: 'Do I need any experience to join a class?',
      questionAuthor: 'A Guest',
      answer:
        'No experience at all. Our wheel and handbuilding classes are designed for complete beginners, and we work with returning students too. You will be guided the whole way.',
      answerAuthor: 'Pottery House Krabi',
      isOwnerAnswer: true,
      upvoteCount: 22,
      source: 'manual',
      status: 'published',
      sortOrder: 1,
    },
    {
      id: 'qa-ph-2',
      locationId: 'loc-pottery-house',
      question: 'Are materials and firing included in the price?',
      questionAuthor: 'A Guest',
      answer:
        'Yes. Clay, tools, apron, bisque firing, and glaze firing are all included in your class price. Studio glazes are also available for you to choose from.',
      answerAuthor: 'Pottery House Krabi',
      isOwnerAnswer: true,
      upvoteCount: 19,
      source: 'manual',
      status: 'published',
      sortOrder: 2,
    },
    {
      id: 'qa-ph-3',
      locationId: 'loc-pottery-house',
      question: 'How long until I can collect my finished piece?',
      questionAuthor: 'A Guest',
      answer:
        'Pieces are typically ready within 2 to 3 weeks after your class. If you are leaving Krabi before then, we can ship your piece to you anywhere in the world.',
      answerAuthor: 'Pottery House Krabi',
      isOwnerAnswer: true,
      upvoteCount: 17,
      source: 'manual',
      status: 'published',
      sortOrder: 3,
    },
    {
      id: 'qa-ph-4',
      locationId: 'loc-pottery-house',
      question: 'How do I book Cocktails & Clay?',
      questionAuthor: 'A Guest',
      answer:
        'Cocktails & Clay runs every Friday from 7PM to 10PM. You can book online or message us on Instagram @potteryclasseskrabi. Spots fill up so we recommend booking in advance.',
      answerAuthor: 'Pottery House Krabi',
      isOwnerAnswer: true,
      upvoteCount: 14,
      source: 'manual',
      status: 'published',
      sortOrder: 4,
    },
    {
      id: 'qa-ph-5',
      locationId: 'loc-pottery-house',
      question: 'Do you offer classes for children?',
      questionAuthor: 'A Guest',
      answer:
        'Yes, we welcome families. We recommend ages 8 and up for wheel classes. Handbuilding is available for younger children. Let us know when booking.',
      answerAuthor: 'Pottery House Krabi',
      isOwnerAnswer: true,
      upvoteCount: 11,
      source: 'manual',
      status: 'published',
      sortOrder: 5,
    },
    {
      id: 'qa-ph-b1',
      locationId: 'loc-pottery-beachfront',
      question: 'How do I book the beachfront pottery session?',
      questionAuthor: 'A Guest',
      answer:
        'The beachfront session at Klong Muang runs on selected days with very limited seats (maximum 4 guests). Message us on Instagram @potteryclasseskrabi or email us to check availability.',
      answerAuthor: 'Pottery House Krabi',
      isOwnerAnswer: true,
      upvoteCount: 16,
      source: 'manual',
      status: 'published',
      sortOrder: 1,
    },
  ],
  posts: [
    {
      id: 'post-ph-1',
      locationId: 'loc-pottery-house',
      postType: 'update',
      title: 'Doors open, wheels spinning.',
      body: 'Welcome to Pottery House. We are open for wheel classes, handbuilding sessions, and Cocktails & Clay every Friday night. Walk-ins welcome when we have space, but booking ahead is always a good idea. Find us on Instagram @potteryclasseskrabi.',
      imageAssetId: 'media-ph-post1',
      status: 'published',
      publishedAt: '2026-05-01T10:00:00.000Z',
      createdBy: 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO',
      channelJobs: [
        { id: 'pcj-ph-1', channel: 'site', status: 'published', publishedAt: '2026-05-01T10:00:00.000Z' },
      ],
    },
    {
      id: 'post-ph-2',
      locationId: 'loc-pottery-house',
      postType: 'standard',
      title: null,
      body: 'Nothing makes our team happier than happy students. Turns out clay, coffee, and a few proud smiles are the perfect recipe. Thank you for making the studio so joyful.',
      imageAssetId: 'media-ph-post2',
      status: 'published',
      publishedAt: '2026-05-15T10:00:00.000Z',
      createdBy: 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO',
      channelJobs: [
        { id: 'pcj-ph-2', channel: 'site', status: 'published', publishedAt: '2026-05-15T10:00:00.000Z' },
      ],
    },
    {
      id: 'post-ph-3',
      locationId: 'loc-pottery-house',
      postType: 'offer',
      title: 'Cocktails & Clay — Every Friday, 7PM to 10PM',
      body: 'Grab a drink, sit at the wheel, and see what your hands can do. Our Friday night Cocktails & Clay session is social, relaxed, and genuinely fun — whether you are a first-timer or you already know your way around a wheel. ฿1,500 per person. Book via Instagram @potteryclasseskrabi.',
      imageAssetId: 'media-ph-post3',
      status: 'published',
      publishedAt: '2026-05-20T09:00:00.000Z',
      createdBy: 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO',
      channelJobs: [
        { id: 'pcj-ph-3', channel: 'site', status: 'published', publishedAt: '2026-05-20T09:00:00.000Z' },
      ],
    },
  ],
  publicRoutes: [
    {
      path: '/experiences',
      title: /Experiences \| Pottery House Krabi/,
      text: 'Pottery Wheel Class',
    },
    {
      path: '/experiences/pottery-wheel-class',
      title: /Pottery Wheel Class Krabi — Pottery House/,
      text: 'Shape something beautiful',
    },
    {
      path: '/experiences/cocktails-and-clay',
      title: /Cocktails & Clay Friday Night — Pottery House Krabi/,
      text: 'Friday nights',
    },
    {
      path: '/experiences/beachfront-pottery',
      title: /Beachfront Pottery Class Klong Muang Krabi — Pottery House/,
      text: 'Throw on the wheel',
    },
    {
      path: '/experiences/monthly-membership',
      title: /Monthly Pottery Studio Membership Krabi — Pottery House/,
      text: 'creative base',
    },
  ],
}

export const compiledPotteryHouseSeed = compileCuratedSiteFixture(potteryHouseFixture)

export function renderCompiledPotteryHouseCoreSeedBlock(): string {
  const siteConfigRows = compiledPotteryHouseSeed.siteConfig
    .map((entry) => `  (${[
      sqlValue(compiledPotteryHouseSeed.identity.organizationId),
      sqlValue(compiledPotteryHouseSeed.identity.siteId),
      sqlValue(entry.key),
      sqlValue(entry.value),
    ].join(', ')})`)
    .join(',\n')

  const siteLocaleRows = compiledPotteryHouseSeed.siteLocales
    .map((entry) => `  (${[
      sqlValue(entry.id),
      sqlValue(compiledPotteryHouseSeed.identity.organizationId),
      sqlValue(compiledPotteryHouseSeed.identity.siteId),
      sqlValue(entry.locale),
      sqlValue(entry.label),
      sqlValue(entry.isSource),
      sqlValue(entry.status),
      sqlValue(entry.fallbackEnabled),
    ].join(', ')})`)
    .join(',\n')

  const siteDomainRows = compiledPotteryHouseSeed.siteDomains
    .map((entry) => `  (${[
      sqlValue(entry.id),
      sqlValue(compiledPotteryHouseSeed.identity.organizationId),
      sqlValue(compiledPotteryHouseSeed.identity.siteId),
      sqlValue(entry.domain),
      sqlValue(entry.type),
      sqlValue(entry.role),
      sqlValue(entry.status),
      sqlValue(entry.dnsStatus),
    ].join(', ')})`)
    .join(',\n')

  const locationRows = compiledPotteryHouseSeed.locations
    .map((location) => `  (${[
      sqlValue(location.id),
      sqlValue(compiledPotteryHouseSeed.identity.organizationId),
      sqlValue(compiledPotteryHouseSeed.identity.siteId),
      sqlValue(location.slug),
      sqlValue(location.title),
      sqlValue(location.city),
      sqlJson(location.address),
      sqlValue(location.phone),
      sqlValue(location.email),
      sqlValue(location.mapsUrl),
      sqlValue(location.latitude),
      sqlValue(location.longitude),
      sqlValue(location.description),
      sqlValue(location.shortDescription),
      sqlJson(location.openingHours),
      sqlValue(location.rating),
      sqlValue(location.reviewCount),
      sqlValue(location.priceLevel),
      sqlJson(location.categories),
      sqlValue(location.instagramUrl),
      sqlValue(location.facebookUrl),
      sqlValue(location.isPrimary),
      sqlValue(location.status),
    ].join(', ')})`)
    .join(',\n')

  const { site, identity } = compiledPotteryHouseSeed
  return `-- BEGIN GENERATED: pottery_core
-- Pottery House Krabi core generated from the curated fixture contract.
INSERT INTO sites (
  id, organization_id, theme_id, theme, slug, subdomain,
  brand_name, brand_description,
  status, plan, onboarding_status, url_structure, primary_location_id,
  contact_email, contact_phone, default_currency, vertical, content_source, media_source
) VALUES (
  ${sqlValue(identity.siteId)},
  ${sqlValue(identity.organizationId)},
  ${sqlValue(site.themeId)},
  ${sqlValue(site.theme)},
  ${sqlValue(site.slug)},
  ${sqlValue(site.subdomain)},
  ${sqlValue(site.brandName)},
  ${sqlValue(site.brandDescription)},
  ${sqlValue(site.status)},
  ${sqlValue(site.plan)},
  ${sqlValue(site.onboardingStatus)},
  ${sqlValue(site.urlStructure)},
  NULL,
  ${sqlValue(site.contactEmail)},
  ${sqlValue(site.contactPhone ?? null)},
  ${sqlValue(site.defaultCurrency)},
  ${sqlValue(site.vertical)},
  ${sqlValue(site.contentSource)},
  ${sqlValue(site.mediaSource)}
);

INSERT INTO site_config (organization_id, site_id, key, value)
VALUES
${siteConfigRows};

INSERT INTO site_locales
  (id, organization_id, site_id, locale, label, is_source, status, fallback_enabled)
VALUES
${siteLocaleRows};

INSERT INTO site_domains (id, organization_id, site_id, domain, type, role, status, dns_status)
VALUES
${siteDomainRows};

INSERT INTO business_locations (
  id, organization_id, site_id, slug, title, city,
  address, phone, email, maps_url,
  latitude, longitude,
  description, short_description,
  opening_hours,
  rating, review_count,
  price_level, categories,
  instagram_url, facebook_url,
  is_primary, status
) VALUES
${locationRows};

UPDATE sites SET primary_location_id = ${sqlValue(site.primaryLocationId)} WHERE id = ${sqlValue(identity.siteId)};
-- END GENERATED: pottery_core`
}

export function renderCompiledPotteryHouseMediaBlock(): string {
  const mediaRows = compiledPotteryHouseSeed.mediaAssets
    .map((media) => `  (${[
      sqlValue(media.id),
      sqlValue(media.organizationId),
      sqlValue(media.siteId),
      sqlValue(media.locationId),
      sqlValue(media.kind),
      sqlValue(media.provider),
      sqlValue(media.source),
      sqlValue(media.r2Key),
      sqlValue(media.publicUrl),
      sqlValue(media.thumbnailUrl),
      sqlValue(media.mimeType),
      sqlValue(media.fileName),
      sqlValue(media.altText),
      sqlValue(media.category),
      sqlValue(media.status),
    ].join(', ')})`)
    .join(',\n')

  const heroUpdates = compiledPotteryHouseSeed.locations
    .filter((loc) => loc.heroImageAssetId || loc.heroVideoAssetId)
    .map((loc) => {
      const parts: string[] = []
      if (loc.heroImageAssetId) parts.push(`hero_image_asset_id = ${sqlValue(loc.heroImageAssetId)}`)
      if (loc.heroVideoAssetId) parts.push(`hero_video_asset_id = ${sqlValue(loc.heroVideoAssetId)}`)
      return `UPDATE business_locations SET ${parts.join(', ')} WHERE id = ${sqlValue(loc.id)};`
    })
    .join('\n')

  return `-- BEGIN GENERATED: pottery_media
-- All media assets for Pottery House Krabi.
INSERT OR REPLACE INTO media_assets
  (id, organization_id, site_id, location_id,
   kind, provider, source,
   r2_key, public_url, thumbnail_url,
   mime_type, file_name, alt_text, category, status)
VALUES
${mediaRows};

${heroUpdates}
-- END GENERATED: pottery_media`
}

export function renderCompiledPotteryHouseExperiencesBlock(): string {
  const experienceRows = compiledPotteryHouseSeed.experiences
    .map((experience) => `  (${[
      sqlValue(experience.id),
      sqlValue(experience.organizationId),
      sqlValue(experience.siteId),
      sqlValue(experience.locationId),
      sqlValue(experience.title),
      sqlValue(experience.slug),
      sqlValue(experience.tagline),
      sqlValue(experience.body),
      sqlValue(experience.imageAssetId),
      sqlValue(experience.price),
      sqlValue(experience.durationMinutes),
      sqlValue(experience.maxCapacity),
      sqlJson(experience.timeSlots.length > 0 ? experience.timeSlots : null),
      sqlValue(experience.availableNote),
      sqlValue(experience.status),
      sqlValue(experience.sortOrder),
      sqlValue(experience.featured),
      sqlValue(experience.featuredSortOrder),
      sqlValue(experience.seoTitle),
      sqlValue(experience.seoDescription),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: pottery_experiences
-- Experiences for Pottery House Krabi.
INSERT OR REPLACE INTO experiences
  (id, organization_id, site_id, location_id,
   title, slug, tagline, body,
   image_asset_id, price, duration_minutes, max_capacity,
   time_slots, available_note,
   status, sort_order, featured, featured_sort_order,
   seo_title, seo_description)
VALUES
${experienceRows};
-- END GENERATED: pottery_experiences`
}

export function renderCompiledPotteryHouseReviewsBlock(): string {
  const reviewRows = compiledPotteryHouseSeed.reviews
    .map((review) => `  (${[
      sqlValue(review.id),
      sqlValue(review.organizationId),
      sqlValue(review.siteId),
      sqlValue(review.locationId),
      sqlValue(review.authorName),
      sqlValue(review.reviewerPhotoUrl),
      sqlValue(review.rating),
      sqlValue(review.content),
      sqlValue(review.ownerReply),
      sqlValue(review.ownerReplyAt),
      sqlValue(review.status),
      sqlValue(review.source),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: pottery_reviews
-- Reviews for Pottery House Krabi.
INSERT INTO reviews
  (id, organization_id, site_id, location_id,
   author_name, reviewer_photo_url, rating, content,
   owner_reply, owner_reply_at,
   status, source)
VALUES
${reviewRows};
-- END GENERATED: pottery_reviews`
}

export function renderCompiledPotteryHouseQaBlock(): string {
  const qaRows = compiledPotteryHouseSeed.locationQa
    .map((qa) => `  (${[
      sqlValue(qa.id),
      sqlValue(qa.organizationId),
      sqlValue(qa.siteId),
      sqlValue(qa.locationId),
      sqlValue(qa.question),
      sqlValue(qa.questionAuthor),
      sqlValue(qa.answer),
      sqlValue(qa.answerAuthor),
      sqlValue(qa.isOwnerAnswer),
      sqlValue(qa.upvoteCount),
      sqlValue(qa.source),
      sqlValue(qa.status),
      sqlValue(qa.sortOrder),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: pottery_qa
-- Location Q&A for Pottery House Krabi.
INSERT INTO location_qa
  (id, organization_id, site_id, location_id,
   question, question_author, answer, answer_author,
   is_owner_answer, upvote_count, source, status, sort_order)
VALUES
${qaRows};
-- END GENERATED: pottery_qa`
}

export function renderCompiledPotteryHousePostsBlock(): string {
  const postRows = compiledPotteryHouseSeed.posts
    .map((post) => `  (${[
      sqlValue(post.id),
      sqlValue(post.organizationId),
      sqlValue(post.siteId),
      sqlValue(post.locationId),
      sqlValue(post.postType),
      sqlValue(post.title),
      sqlValue(post.body),
      sqlValue(post.imageAssetId),
      sqlValue(post.status),
      sqlValue(post.publishedAt),
      sqlValue(post.createdBy),
    ].join(', ')})`)
    .join(',\n')

  const allChannelJobs = compiledPotteryHouseSeed.posts.flatMap((post) => post.channelJobs)
  const channelJobRows = allChannelJobs
    .map((job) => `  (${[
      sqlValue(job.id),
      sqlValue(job.postId),
      sqlValue(job.organizationId),
      sqlValue(job.channel),
      sqlValue(job.status),
      sqlValue(job.publishedAt),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: pottery_posts
-- Posts and channel jobs for Pottery House Krabi.
INSERT INTO posts
  (id, organization_id, site_id, location_id,
   post_type, title, body, image_asset_id,
   status, published_at, created_by)
VALUES
${postRows};

INSERT INTO post_channel_jobs (id, post_id, organization_id, channel, status, published_at)
VALUES
${channelJobRows};
-- END GENERATED: pottery_posts`
}

export function renderCompiledPotteryHouseContentBlock(): string {
  const contentRows = compiledPotteryHouseSeed.siteContent
    .map((entry) => `  (${[
      sqlValue(entry.id),
      sqlValue(entry.organizationId),
      sqlValue(entry.siteId),
      sqlValue(entry.locationId),
      sqlValue(entry.page),
      sqlValue(entry.field),
      sqlValue(entry.content),
      sqlValue(entry.heroTitle),
      sqlValue(entry.heroSubtitle),
      sqlValue(entry.heroImageAssetId),
      sqlValue(entry.heroVideoAssetId),
      sqlValue(entry.type),
      sqlValue(entry.source),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: pottery_content
-- Site content for Pottery House Krabi.
INSERT INTO site_content
  (id, organization_id, site_id, location_id,
   page, field, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id,
   type, source)
VALUES
${contentRows};
-- END GENERATED: pottery_content`
}
