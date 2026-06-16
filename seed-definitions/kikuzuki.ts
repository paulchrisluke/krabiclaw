import { compileCuratedSiteFixture } from './compile.ts'
import type { CuratedSiteDefinition } from './contracts.ts'
import { renderOrganizationBillingSql, renderOrganizationEntitlementsSql } from './billing-sql.ts'

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

const CDN = 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg'

function cfImg(cloudflareImageId: string, slug: string) {
  return {
    provider: 'cloudflare_images' as const,
    source: 'uploaded' as const,
    cloudflareImageId,
    publicUrl: `${CDN}/${cloudflareImageId}/public`,
    thumbnailUrl: `${CDN}/${cloudflareImageId}/thumbnail`,
    mimeType: 'image/jpeg',
    fileName: `${slug}.jpg`,
    category: 'food' as const,
  }
}

export const kikuzukiFixture: CuratedSiteDefinition = {
  fixtureId: 'kikuzuki',
  organizationId: 'org-kikuzuki',
  siteId: 'site-kikuzuki',
  site: {
    slug: 'kikuzuki',
    subdomain: 'kikuzuki-krabi-thailand',
    brandName: 'Kikuzuki Krabi Thailand',
    logoAssetId: 'media-kiku-logo',
    themeId: 'saya-theme-v1',
    theme: 'saya',
    brandDescription:
      'Welcome to Kikuzuki, where we celebrate the vibrant flavors and rich traditions of Japanese cuisine.',
    status: 'active',
    plan: 'free',
    onboardingStatus: 'active',
    urlStructure: 'location_subdirectories',
    primaryLocationId: 'loc-kikuzuki',
    contactEmail: 'contact@kikuzuki.com',
    defaultCurrency: 'THB',
    vertical: 'restaurant',
    contentSource: 'google_maps',
    mediaSource: 'client_photos',
  },
  siteConfig: [
    { key: 'source_locale', value: 'en' },
  ],
  siteLocales: [
    {
      id: 'locale::org-kikuzuki::site-kikuzuki::en',
      locale: 'en',
      label: 'English',
      isSource: true,
      status: 'published',
      fallbackEnabled: true,
    },
  ],
  siteDomains: [
    {
      id: 'domain-kikuzuki-local',
      domain: 'kikuzuki-krabi-thailand.localhost',
      type: 'subdomain',
      role: 'secondary',
      status: 'active',
      dnsStatus: 'valid',
    },
    {
      id: 'domain-kikuzuki-prod',
      domain: 'kikuzuki-krabi-thailand.krabiclaw.com',
      type: 'subdomain',
      role: 'canonical',
      status: 'active',
      dnsStatus: 'valid',
    },
  ],
  locations: [
    {
      id: 'loc-kikuzuki',
      slug: 'kikuzuki-japanese-robatayaki-izakaya',
      title: 'Kikuzuki Japanese Robatayaki & Izakaya',
      city: 'Krabi',
      address: {
        addressLines: ['325, Tambon Ao Nang'],
        locality: 'Tambon Ao Nang',
        administrativeArea: 'Krabi',
        postalCode: '81180',
        country: 'TH',
      },
      phone: '095 293 2112',
      email: 'contact@kikuzuki.com',
      mapsUrl: 'https://maps.google.com/?cid=1118554760456576469',
      latitude: 8.0337,
      longitude: 98.8390,
      description:
        'Kikuzuki Japanese Restaurant, nestled in the heart of Krabi, Thailand, is a culinary haven that specialises in the artful fusion of robatayaki and sushi. Beyond the sliding glazed door entrance and the Kikuzuki Giant red lucky cat, you are welcomed into a little piece of Japan. The aroma of robatayaki and the artistry of sushi converge in an ambiance of warm wood and subtle lighting that transports diners to the heart of Japan.',
      shortDescription:
        'Japanese robatayaki and sushi restaurant in Ao Nang, Krabi. Traditional techniques, modern presentation.',
      openingHours: [
        { openDay: 'MONDAY', openTime: '14:00', closeTime: '23:00' },
        { openDay: 'TUESDAY', openTime: '14:00', closeTime: '23:00' },
        { openDay: 'WEDNESDAY', openTime: '14:00', closeTime: '23:00' },
        { openDay: 'THURSDAY', openTime: '14:00', closeTime: '23:00' },
        { openDay: 'FRIDAY', openTime: '14:00', closeTime: '23:00' },
        { openDay: 'SATURDAY', openTime: '14:00', closeTime: '23:00' },
        { openDay: 'SUNDAY', openTime: '14:00', closeTime: '23:00' },
      ],
      rating: null,
      reviewCount: null,
      priceLevel: '฿฿฿',
      categories: ['Japanese Restaurant', 'Robatayaki', 'Sushi', 'Izakaya'],
      instagramUrl: '',
      facebookUrl: '',
      isPrimary: true,
      status: 'active',
      heroVideoAssetId: 'media-kiku-hero-video',
    },
  ],
  mediaAssets: [
    // Logo
    {
      id: 'media-kiku-logo',
      locationId: null,
      ...cfImg('f2eb4d12-f586-455f-217f-3f3de95f3700', 'kikuzuki-logo'),
      mimeType: 'image/png',
      altText: 'Kikuzuki logo',
      category: 'other',
    },
    // Hero video
    {
      id: 'media-kiku-hero-video',
      locationId: 'loc-kikuzuki',
      kind: 'video',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2Key: 'sites/3ad92fb5-4ecf-4f81-aa16-278a7dc3c859/media/e864ac34-9b1f-4162-9e5c-aa21cbddb45f.mp4',
      publicUrl: 'https://media.krabiclaw.com/sites/3ad92fb5-4ecf-4f81-aa16-278a7dc3c859/media/e864ac34-9b1f-4162-9e5c-aa21cbddb45f.mp4',
      thumbnailUrl: null,
      mimeType: 'video/mp4',
      fileName: 'kikuzuki-hero-video.mp4',
      altText: 'Kikuzuki restaurant atmosphere',
      category: 'interior',
    },
    // About story image
    {
      id: 'media-kiku-about',
      locationId: null,
      ...cfImg('f65505ac-e3a6-4030-aa33-65e8ac58bf00', 'kikuzuki-about'),
      mimeType: 'image/png',
      altText: 'Kikuzuki restaurant interior',
      category: 'interior',
    },
    // Sushi section images
    { id: 'media-kiku-tuna-sushi', locationId: 'loc-kikuzuki', ...cfImg('bac4e88e-018f-4418-e2ea-c920283d8d00', 'tuna-sushi'), altText: 'Tuna sushi' },
    { id: 'media-kiku-salmon-sushi', locationId: 'loc-kikuzuki', ...cfImg('a8e212b4-633b-4714-4604-9937378ab500', 'salmon-sushi'), altText: 'Salmon sushi' },
    { id: 'media-kiku-chutoro-sushi', locationId: 'loc-kikuzuki', ...cfImg('4401b0c3-a02b-4426-cdd7-0a2973f6e900', 'chutoro-sushi'), altText: 'Chutoro sushi' },
    { id: 'media-kiku-ama-ebi-sushi', locationId: 'loc-kikuzuki', ...cfImg('524c4c04-e622-4ad2-b2fa-966d41454600', 'ama-ebi-sushi'), altText: 'Ama ebi sushi' },
    { id: 'media-kiku-a4-beef-sushi-tamago', locationId: 'loc-kikuzuki', ...cfImg('25951096-2e1e-4ee5-154a-1adad511d700', 'a4-beef-sushi-tamago'), mimeType: 'image/png', altText: 'A4 beef sushi tamago' },
    { id: 'media-kiku-uni-nigiri', locationId: 'loc-kikuzuki', ...cfImg('e711d0c7-e052-4dbb-2dae-92f63998fd00', 'uni-nigiri'), altText: 'Uni nigiri' },
    { id: 'media-kiku-ebi-sushi', locationId: 'loc-kikuzuki', ...cfImg('b363f614-3008-4a7e-11c6-029e9252b700', 'ebi-sushi'), altText: 'Ebi sushi' },
    { id: 'media-kiku-katsuo-sushi', locationId: 'loc-kikuzuki', ...cfImg('c58a5944-0247-474f-71e2-85d2d68aff00', 'katsuo-sushi'), altText: 'Katsuo sushi' },
    { id: 'media-kiku-omakase-sushi-7', locationId: 'loc-kikuzuki', ...cfImg('8c4f1ad7-2bef-41ca-2818-15f638518900', 'omakase-sushi-7-kinds'), altText: 'Omakase sushi 7 kinds' },
    { id: 'media-kiku-tamago-nigiri', locationId: 'loc-kikuzuki', ...cfImg('ece5c7f5-1e28-4131-2130-e8ddc70c6e00', 'tamago-nigiri'), altText: 'Tamago nigiri' },
    { id: 'media-kiku-herring-nigiri', locationId: 'loc-kikuzuki', ...cfImg('71aa4193-3992-45be-3e03-7073fbb6d000', 'herring-nigiri'), altText: 'Herring nigiri' },
    { id: 'media-kiku-toro-salmon', locationId: 'loc-kikuzuki', ...cfImg('fd5bcda9-a5b0-40e8-1a8b-0b774128af00', 'toro-salmon'), altText: 'Toro salmon sushi' },
    { id: 'media-kiku-omakase-sushi-3', locationId: 'loc-kikuzuki', ...cfImg('a25738e8-2848-43d2-b830-94cf40a2e100', 'omakase-sushi-3-kinds'), mimeType: 'image/png', altText: 'Omakase sushi 3 kinds' },
    { id: 'media-kiku-negi-toro-nigiri', locationId: 'loc-kikuzuki', ...cfImg('ddde97b2-0920-487e-04b4-a866e4ac6e00', 'negi-toro-nigiri'), altText: 'Negi toro nigiri' },
    { id: 'media-kiku-hotate-sushi', locationId: 'loc-kikuzuki', ...cfImg('5d9e2971-4ac7-4c9c-3d69-46179ebf6c00', 'hotate-sushi'), altText: 'Hotate sushi' },
    { id: 'media-kiku-unagi-sushi', locationId: 'loc-kikuzuki', ...cfImg('c44c4e93-f20a-4e19-62af-87564396cf00', 'unagi-sushi'), altText: 'Unagi sushi' },
    { id: 'media-kiku-foie-gras-sushi', locationId: 'loc-kikuzuki', ...cfImg('dcdbe9d5-cbac-41e7-14ff-f7b54c050f00', 'foie-gras-sushi'), altText: 'Foie gras sushi' },
    { id: 'media-kiku-seabass-sushi', locationId: 'loc-kikuzuki', ...cfImg('013c9575-991a-4579-4348-a788d6af8600', 'seabass-sushi'), altText: 'Seabass sushi' },
    { id: 'media-kiku-hamachi-sushi', locationId: 'loc-kikuzuki', ...cfImg('1010b065-7537-4479-9f8c-0b6a3a1c1200', 'hamachi-sushi'), altText: 'Hamachi sushi' },
    { id: 'media-kiku-madai-sushi', locationId: 'loc-kikuzuki', ...cfImg('dd5760b5-94ee-4f85-4ca6-7416f693bf00', 'madai-sushi'), altText: 'Madai sushi' },
    { id: 'media-kiku-tako-sushi', locationId: 'loc-kikuzuki', ...cfImg('935068c2-19a6-4cfc-1130-31aecb790e00', 'tako-sushi'), altText: 'Tako sushi' },
    { id: 'media-kiku-ika-sushi', locationId: 'loc-kikuzuki', ...cfImg('9f264a1f-a6a0-4a90-07d4-7f743cdca600', 'ika-sushi'), altText: 'Ika sushi' },
    { id: 'media-kiku-akagai-sushi', locationId: 'loc-kikuzuki', ...cfImg('bf7dd596-41b3-455a-b46b-ccad18a5b400', 'akagai-sushi'), altText: 'Akagai sushi' },
    { id: 'media-kiku-a4-beef-sushi', locationId: 'loc-kikuzuki', ...cfImg('b93839c4-af21-4191-925a-a665c520a400', 'a4-beef-sushi'), altText: 'A4 beef sushi' },
    { id: 'media-kiku-akami-sushi', locationId: 'loc-kikuzuki', ...cfImg('61530f5e-ee3c-4749-5d76-51427c0e2400', 'akami-sushi'), altText: 'Akami sushi' },
    { id: 'media-kiku-ikura-nigiri', locationId: 'loc-kikuzuki', ...cfImg('67710827-d602-4b8f-5446-0d413e6fe500', 'ikura-nigiri'), altText: 'Ikura nigiri' },
    { id: 'media-kiku-ikura-uni-nigiri', locationId: 'loc-kikuzuki', ...cfImg('11b37924-b509-4d50-551e-e055d9ce6000', 'ikura-uni-nigiri'), altText: 'Ikura and uni nigiri' },
    { id: 'media-kiku-kinki-nigiri', locationId: 'loc-kikuzuki', ...cfImg('05329a99-3b0c-4520-9361-4be07f046700', 'kinki-nigiri'), altText: 'Kinki nigiri' },
    { id: 'media-kiku-otoro-sushi', locationId: 'loc-kikuzuki', ...cfImg('01eed81d-64aa-4283-50b6-c9664285dd00', 'otoro-sushi'), altText: 'Otoro sushi' },
    { id: 'media-kiku-shime-saba-sushi', locationId: 'loc-kikuzuki', ...cfImg('20597472-d97e-4280-8f5a-0c5902ca9e00', 'shime-saba-sushi'), altText: 'Shime saba sushi' },
    { id: 'media-kiku-tobiko-nigiri', locationId: 'loc-kikuzuki', ...cfImg('54354754-4a69-4d0c-3542-3d66c44c8300', 'tobiko-nigiri'), mimeType: 'image/png', altText: 'Tobiko nigiri' },
    { id: 'media-kiku-omakase-sushi-10', locationId: 'loc-kikuzuki', ...cfImg('f0a4c2e2-cac8-4f94-b8b2-83b465246700', 'omakase-sushi-10-kinds'), altText: 'Omakase sushi 10 kinds' },
    // Sashimi section images
    { id: 'media-kiku-chutoro-sashimi', locationId: 'loc-kikuzuki', ...cfImg('17f4e5a2-b4b1-4149-d045-9f5d85129300', 'chutoro-sashimi'), altText: 'Chutoro sashimi' },
    { id: 'media-kiku-uni-sashimi', locationId: 'loc-kikuzuki', ...cfImg('06975364-585b-4700-958f-b7a59450dc00', 'uni-sashimi-30g'), altText: 'Uni sashimi 30g' },
    { id: 'media-kiku-tuna-sashimi', locationId: 'loc-kikuzuki', ...cfImg('f9a0343d-a197-4b87-fb96-77231e488900', 'tuna-sashimi'), altText: 'Tuna sashimi' },
    { id: 'media-kiku-akagai-sashimi', locationId: 'loc-kikuzuki', ...cfImg('24130378-af18-4714-fb91-d61a3dda4400', 'akagai-sashimi'), altText: 'Akagai sashimi' },
    { id: 'media-kiku-nori-seaweed', locationId: 'loc-kikuzuki', ...cfImg('c078f001-f622-4a6d-767d-8bc65ab85b00', 'nori-seaweed'), altText: 'Nori seaweed' },
    { id: 'media-kiku-toro-salmon-sashimi', locationId: 'loc-kikuzuki', ...cfImg('c1817783-2256-426a-9720-973f0afcfa00', 'toro-salmon-sashimi'), altText: 'Toro salmon sashimi' },
    { id: 'media-kiku-kinki-sashimi', locationId: 'loc-kikuzuki', ...cfImg('e736eeb8-fe39-4333-1a5b-047ef67c6a00', 'kinki-sashimi'), altText: 'Kinki sashimi' },
    { id: 'media-kiku-hotate-sashimi', locationId: 'loc-kikuzuki', ...cfImg('e2345e24-05ab-40fd-9a40-5d31ae575c00', 'hotate-sashimi'), altText: 'Hotate sashimi' },
    { id: 'media-kiku-herring-sashimi', locationId: 'loc-kikuzuki', ...cfImg('322cb96a-a505-4aa6-d501-9921424c9400', 'herring-sashimi'), mimeType: 'image/png', altText: 'Herring sashimi' },
    { id: 'media-kiku-akami-sashimi', locationId: 'loc-kikuzuki', ...cfImg('81ddc733-e1e8-47ab-74dd-6975c95f4c00', 'akami-sashimi'), altText: 'Akami sashimi' },
    { id: 'media-kiku-ama-ebi-sashimi', locationId: 'loc-kikuzuki', ...cfImg('91163b15-3755-4db9-7435-30c524d8c500', 'ama-ebi-sashimi'), altText: 'Ama ebi sashimi' },
    { id: 'media-kiku-salmon-sashimi', locationId: 'loc-kikuzuki', ...cfImg('27e32ad9-8a12-462f-be30-98c3de980500', 'salmon-sashimi'), altText: 'Salmon sashimi' },
    { id: 'media-kiku-seabass-sashimi', locationId: 'loc-kikuzuki', ...cfImg('e63eb2d0-f23c-46f7-aa57-80f900c12600', 'seabass-sashimi'), altText: 'Seabass sashimi' },
    { id: 'media-kiku-ankimo-sashimi', locationId: 'loc-kikuzuki', ...cfImg('449752a3-974a-4900-e81c-96df4e456900', 'ankimo-sashimi'), altText: 'Ankimo sashimi' },
    { id: 'media-kiku-ika-sashimi', locationId: 'loc-kikuzuki', ...cfImg('2639587a-f0ef-44f6-5074-414b42236900', 'ika-sashimi'), mimeType: 'image/png', altText: 'Ika sashimi' },
    { id: 'media-kiku-ikura-sashimi', locationId: 'loc-kikuzuki', ...cfImg('98c4cd3c-c9b2-45b9-a5a0-0a021ded7400', 'ikura-sashimi'), mimeType: 'image/png', altText: 'Ikura sashimi' },
    { id: 'media-kiku-katsuo-sashimi', locationId: 'loc-kikuzuki', ...cfImg('36da0f3e-b16f-4b12-3973-5078b6a02700', 'katsuo-sashimi'), mimeType: 'image/png', altText: 'Katsuo sashimi' },
    { id: 'media-kiku-otoro-sashimi', locationId: 'loc-kikuzuki', ...cfImg('1a2987d0-7bc2-4796-a2c4-758573c68100', 'otoro-sashimi'), mimeType: 'image/png', altText: 'Otoro sashimi' },
    { id: 'media-kiku-madai-sashimi', locationId: 'loc-kikuzuki', ...cfImg('6acf31df-51e1-4e63-1786-7e0e8eb2b100', 'madai-sashimi'), altText: 'Madai sashimi' },
    { id: 'media-kiku-hamachi-sashimi', locationId: 'loc-kikuzuki', ...cfImg('fbe779da-1d17-4f53-0848-9a070165ea00', 'hamachi-sashimi'), altText: 'Hamachi sashimi' },
    { id: 'media-kiku-shime-saba-sashimi', locationId: 'loc-kikuzuki', ...cfImg('d084169c-5c3b-446c-390b-3a1f6d80f600', 'shime-saba-sashimi'), altText: 'Shime saba sashimi' },
    { id: 'media-kiku-tako-sashimi', locationId: 'loc-kikuzuki', ...cfImg('4824f01f-836f-4af6-da00-9ac335caad00', 'tako-sashimi'), altText: 'Tako sashimi' },
    { id: 'media-kiku-tobiko-sashimi', locationId: 'loc-kikuzuki', ...cfImg('71bf407c-402f-4a96-d65c-d75e5c86e800', 'tobiko-sashimi'), altText: 'Tobiko sashimi' },
    { id: 'media-kiku-tamagoyaki-sashimi', locationId: 'loc-kikuzuki', ...cfImg('ae1fad37-11c8-4e8b-1b73-4ae4fdd25200', 'tamagoyaki-sashimi'), altText: 'Tamagoyaki sashimi' },
    { id: 'media-kiku-omakase-sashimi-3', locationId: 'loc-kikuzuki', ...cfImg('0f980b90-9d87-4ac4-8396-37a2716fe300', 'omakase-sashimi-3-kinds'), mimeType: 'image/png', altText: "Omakase sashimi 3 kinds, chef's selection" },
    { id: 'media-kiku-omakase-sashimi-5', locationId: 'loc-kikuzuki', ...cfImg('867de62d-faa9-48d1-57dc-1638702f2a00', 'omakase-sashimi-5-kinds'), mimeType: 'image/png', altText: "Omakase sashimi 5 kinds, chef's selection" },
    { id: 'media-kiku-omakase-sashimi-7', locationId: 'loc-kikuzuki', ...cfImg('d74a24dc-a1f8-44a1-dee9-307de9f7b200', 'omakase-sashimi-7-kinds'), mimeType: 'image/png', altText: "Omakase sashimi 7 kinds, chef's selection" },
    { id: 'media-kiku-omakase-sashimi-9', locationId: 'loc-kikuzuki', ...cfImg('3cccc906-b49b-4adf-d71e-c65569a36b00', 'omakase-sashimi-9-kinds'), mimeType: 'image/png', altText: "Omakase sashimi 9 kinds, chef's selection" },
    // Carpaccio / Usuzukuri
    { id: 'media-kiku-hamachi-usuzukuri', locationId: 'loc-kikuzuki', ...cfImg('f6fddad9-3eb0-4781-dc4a-dceb1194fd00', 'hamachi-usuzukuri'), altText: 'Hamachi usuzukuri carpaccio' },
    { id: 'media-kiku-salmon-usuzukuri', locationId: 'loc-kikuzuki', ...cfImg('81f2061a-6630-4394-902e-8d0c1e24d700', 'salmon-usuzukuri'), altText: 'Salmon usuzukuri carpaccio' },
    { id: 'media-kiku-salmon-tuna-hamachi-usuzukuri', locationId: 'loc-kikuzuki', ...cfImg('75e6d9de-00c8-459d-0857-520d3d4b6f00', 'salmon-tuna-hamachi-usuzukuri'), mimeType: 'image/png', altText: 'Salmon tuna hamachi usuzukuri' },
    // Oishii
    { id: 'media-kiku-ebi-roll', locationId: 'loc-kikuzuki', ...cfImg('75a34e30-d42f-422e-971f-5037ed485400', 'ebi-vegetables-roll'), altText: 'Ebi vegetables roll' },
    { id: 'media-kiku-ebi-yaki', locationId: 'loc-kikuzuki', ...cfImg('01f92650-3b71-4874-aa11-85917310d100', 'ebi-yaki'), altText: 'Ebi yaki grilled shrimp' },
    { id: 'media-kiku-mentaiko', locationId: 'loc-kikuzuki', ...cfImg('141dbf6c-b891-4868-ba23-6750e2018700', 'mentaiko'), altText: 'Mentaiko cod roe' },
    { id: 'media-kiku-pirikara-kyuri', locationId: 'loc-kikuzuki', ...cfImg('c1b77acf-302e-4ce2-2ff3-570166ffa500', 'pirikara-kyuri'), altText: 'Pirikara kyuri cucumber salad' },
    { id: 'media-kiku-pirikara-jellyfish', locationId: 'loc-kikuzuki', ...cfImg('7abbe73c-e5c0-4b0a-8f48-722b5de8e000', 'pirikara-yakko-jellyfish'), altText: 'Pirikara yakko jellyfish' },
    { id: 'media-kiku-pirikara-tofu', locationId: 'loc-kikuzuki', ...cfImg('f8c62ed7-25f7-4bdd-03b6-1b6fafc32400', 'pirikara-yakko-tofu'), altText: 'Pirikara yakko tofu' },
    // Tataki
    { id: 'media-kiku-tuna-tataki', locationId: 'loc-kikuzuki', ...cfImg('6f08b180-c855-44ba-6dcf-d3eefc1d9400', 'tuna-tataki'), altText: 'Tuna tataki' },
    { id: 'media-kiku-wagyu-tataki', locationId: 'loc-kikuzuki', ...cfImg('5bce4d8b-4ca1-4abd-22fd-8a7678901200', 'wagyu-rump-beef-tataki'), altText: 'Wagyu rump beef tataki' },
    // Dessert
    { id: 'media-kiku-mango-sticky-rice-roll', locationId: 'loc-kikuzuki', ...cfImg('c51e1e69-cb3b-4f36-6b6e-58dfb3b44400', 'mango-sticky-rice-roll'), mimeType: 'image/png', altText: 'Mango sticky rice roll' },
    { id: 'media-kiku-chocolate-lava', locationId: 'loc-kikuzuki', ...cfImg('18934da6-254f-4150-a45c-d671c81b9600', 'mini-chocolate-lava-vanilla-ice-cream'), mimeType: 'image/png', altText: 'Mini chocolate lava vanilla ice cream' },
    { id: 'media-kiku-rum-raisin-ice-cream', locationId: 'loc-kikuzuki', ...cfImg('0873c414-074c-4b21-78d6-fbfbc8606900', 'rum-raisin-ice-cream'), mimeType: 'image/png', altText: 'Rum and raisin ice cream' },
    { id: 'media-kiku-vanilla-ice-cream', locationId: 'loc-kikuzuki', ...cfImg('449c4abf-a28e-43a8-905d-bf8967aa4000', 'vanilla-ice-cream'), mimeType: 'image/png', altText: 'Vanilla ice cream' },
  ],
  siteContent: [
    {
      id: 'sc-kiku-home-hero',
      locationId: null,
      page: 'home',
      field: 'hero',
      content: null,
      heroTitle: null,
      heroSubtitle: null,
      heroImageAssetId: 'media-kiku-about',
      heroVideoAssetId: 'media-kiku-hero-video',
      type: 'text',
      source: 'manual',
    },
    {
      id: 'sc-kiku-about-hero',
      locationId: null,
      page: 'about',
      field: 'hero',
      content: null,
      heroTitle: 'About Us',
      heroSubtitle: 'Finding Inspiration in Every Turn',
      type: 'text',
      source: 'manual',
    },
    {
      id: 'sc-kiku-story-image',
      locationId: null,
      page: 'about',
      field: 'story.image',
      content: null,
      heroImageAssetId: 'media-kiku-about',
      type: 'media',
      source: 'manual',
    },
    {
      id: 'sc-kiku-story-body',
      locationId: null,
      page: 'about',
      field: 'story.body',
      content:
        'Kikuzuki Japanese Restaurant, nestled in the heart of Krabi, Thailand, is a culinary haven that specialises in the artful fusion of robatayaki and sushi. This gastronomic gem offers a unique dining experience, combining traditional Japanese techniques with a modern twist.',
      type: 'richtext',
      source: 'manual',
    },
    {
      id: 'sc-kiku-journey-body',
      locationId: null,
      page: 'about',
      field: 'journey.body',
      content:
        'Nestled amidst the tropical allure of Krabi, Thailand, Kikuzuki has an enchanting culinary tale. Beyond the sliding glazed door entrance and our Kikuzuki Giant red lucky cat, you are welcomed into a little piece of Japan. Step into a haven where the aroma of robatayaki and the artistry of sushi converge. The restaurant, a symphony of warm wood and subtle lighting, immerses diners in an ambiance that transports them to the heart of Japan.',
      type: 'richtext',
      source: 'manual',
    },
    {
      id: 'sc-kiku-cta-title',
      locationId: null,
      page: 'about',
      field: 'cta.title',
      content: 'Reserve Your Table',
      type: 'text',
      source: 'manual',
    },
    {
      id: 'sc-kiku-cta-description',
      locationId: null,
      page: 'about',
      field: 'cta.description',
      content: 'Join us for an unforgettable dining experience',
      type: 'text',
      source: 'manual',
    },
  ],
  experiences: [],
  reviews: [],
  menus: [
    {
      id: 'menu-kiku-ao-nang',
      locationId: 'loc-kikuzuki',
      name: 'Kikuzuki Ao Nang',
      description: '',
      sectionOrder: ['Sushi', 'Sashimi', 'Carpaccio / Usuzukuri', 'Oishii', 'Tataki', 'Dessert'],
      status: 'published',
      items: [
        // Sushi
        { id: 'item-kiku-tuna-sushi', section: 'Sushi', name: 'Tuna Sushi', slug: 'tuna-sushi', description: 'Tuna', priceAmount: 75, imageAssetId: 'media-kiku-tuna-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-salmon-sushi', section: 'Sushi', name: 'Salmon Sushi', slug: 'salmon-sushi', description: 'Salmon', priceAmount: 65, imageAssetId: 'media-kiku-salmon-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-chutoro-sushi', section: 'Sushi', name: 'Chutoro Sushi', slug: 'chutoro-sushi', description: 'Medium-fatty bluefin tuna', priceAmount: 210, imageAssetId: 'media-kiku-chutoro-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-ama-ebi-sushi', section: 'Sushi', name: 'Ama Ebi Sushi', slug: 'ama-ebi-sushi', description: 'Sweet shrimp', priceAmount: 100, imageAssetId: 'media-kiku-ama-ebi-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-a4-beef-sushi-tamago', section: 'Sushi', name: 'A4 Beef Sushi Tamago', slug: 'a4-beef-sushi-tamago', description: 'A4 wagyu beef with egg', priceAmount: 300, imageAssetId: 'media-kiku-a4-beef-sushi-tamago', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-uni-nigiri', section: 'Sushi', name: 'Uni Nigiri', slug: 'uni-nigiri', description: 'Sea urchin', priceAmount: 260, imageAssetId: 'media-kiku-uni-nigiri', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-ebi-sushi', section: 'Sushi', name: 'Ebi Sushi', slug: 'ebi-sushi', description: 'Shrimp', priceAmount: 80, imageAssetId: 'media-kiku-ebi-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-katsuo-sushi', section: 'Sushi', name: 'Katsuo Sushi', slug: 'katsuo-sushi', description: 'Bonito / skipjack tuna', priceAmount: 80, imageAssetId: 'media-kiku-katsuo-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-omakase-sushi-7', section: 'Sushi', name: 'Omakase Sushi 7 Kinds', slug: 'omakase-sushi-7-kinds', description: "Chef's selection, 7 kinds", priceAmount: 504, imageAssetId: 'media-kiku-omakase-sushi-7', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-tamago-nigiri', section: 'Sushi', name: 'Tamago Nigiri', slug: 'tamago-nigiri', description: 'Sweet egg', priceAmount: 65, imageAssetId: 'media-kiku-tamago-nigiri', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-herring-nigiri', section: 'Sushi', name: 'Herring Nigiri', slug: 'herring-nigiri', description: 'Herring', priceAmount: 80, imageAssetId: 'media-kiku-herring-nigiri', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-toro-salmon', section: 'Sushi', name: 'Toro Salmon', slug: 'toro-salmon', description: 'Toro salmon', priceAmount: 80, imageAssetId: 'media-kiku-toro-salmon', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-omakase-sushi-3', section: 'Sushi', name: 'Omakase Sushi 3 Kinds', slug: 'omakase-sushi-3-kinds', description: "Chef's selection, 3 kinds", priceAmount: 305, imageAssetId: 'media-kiku-omakase-sushi-3', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-negi-toro-nigiri', section: 'Sushi', name: 'Negi Toro Nigiri', slug: 'negi-toro-nigiri', description: 'Negitoro', priceAmount: 250, imageAssetId: 'media-kiku-negi-toro-nigiri', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-hotate-sushi', section: 'Sushi', name: 'Hotate Sushi', slug: 'hotate-sushi', description: 'Scallop', priceAmount: 80, imageAssetId: 'media-kiku-hotate-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-unagi-sushi', section: 'Sushi', name: 'Unagi Sushi', slug: 'unagi-sushi', description: 'Japanese eel', priceAmount: 100, imageAssetId: 'media-kiku-unagi-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-foie-gras-sushi', section: 'Sushi', name: 'Foie Gras Sushi', slug: 'foie-gras-sushi', description: 'Foie gras liver', priceAmount: 290, imageAssetId: 'media-kiku-foie-gras-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-seabass-sushi', section: 'Sushi', name: 'Seabass Sushi', slug: 'seabass-sushi', description: 'Seabass', priceAmount: 80, imageAssetId: 'media-kiku-seabass-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-hamachi-sushi', section: 'Sushi', name: 'Hamachi Sushi', slug: 'hamachi-sushi', description: 'Yellowtail', priceAmount: 100, imageAssetId: 'media-kiku-hamachi-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-madai-sushi', section: 'Sushi', name: 'Madai Sushi', slug: 'madai-sushi', description: 'Sea bream', priceAmount: 80, imageAssetId: 'media-kiku-madai-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-tako-sushi', section: 'Sushi', name: 'Tako Sushi', slug: 'tako-sushi', description: 'Octopus', priceAmount: 75, imageAssetId: 'media-kiku-tako-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-ika-sushi', section: 'Sushi', name: 'Ika Sushi', slug: 'ika-sushi', description: 'Squid', priceAmount: 70, imageAssetId: 'media-kiku-ika-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-akagai-sushi', section: 'Sushi', name: 'Akagai Sushi', slug: 'akagai-sushi', description: 'Ark shell clam', priceAmount: 70, imageAssetId: 'media-kiku-akagai-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-a4-beef-sushi', section: 'Sushi', name: 'A4 Beef Sushi', slug: 'a4-beef-sushi', description: 'A4 wagyu beef', priceAmount: 280, imageAssetId: 'media-kiku-a4-beef-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-akami-sushi', section: 'Sushi', name: 'Akami Sushi', slug: 'akami-sushi', description: 'Lean bluefin tuna', priceAmount: 160, imageAssetId: 'media-kiku-akami-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-ikura-nigiri', section: 'Sushi', name: 'Ikura Nigiri', slug: 'ikura-nigiri', description: 'Salmon roe', priceAmount: 180, imageAssetId: 'media-kiku-ikura-nigiri', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-ikura-uni-nigiri', section: 'Sushi', name: 'Ikura & Uni Nigiri', slug: 'ikura-uni-nigiri', description: 'Salmon roe and sea urchin', priceAmount: 260, imageAssetId: 'media-kiku-ikura-uni-nigiri', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-kinki-nigiri', section: 'Sushi', name: 'Kinki Nigiri', slug: 'kinki-nigiri', description: 'Kinki fish', priceAmount: 200, imageAssetId: 'media-kiku-kinki-nigiri', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-otoro-sushi', section: 'Sushi', name: 'Otoro Sushi', slug: 'otoro-sushi', description: 'Fatty bluefin tuna', priceAmount: 260, imageAssetId: 'media-kiku-otoro-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-shime-saba-sushi', section: 'Sushi', name: 'Shime Saba Sushi', slug: 'shime-saba-sushi', description: 'Marinated mackerel', priceAmount: 75, imageAssetId: 'media-kiku-shime-saba-sushi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-tobiko-nigiri', section: 'Sushi', name: 'Tobiko Nigiri', slug: 'tobiko-nigiri', description: 'Flying fish roe', priceAmount: 200, imageAssetId: 'media-kiku-tobiko-nigiri', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-omakase-sushi-10', section: 'Sushi', name: 'Omakase Sushi 10 Kinds', slug: 'omakase-sushi-10-kinds', description: "Chef's selection, 10 kinds", priceAmount: 1120, imageAssetId: 'media-kiku-omakase-sushi-10', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        // Sashimi
        { id: 'item-kiku-chutoro-sashimi', section: 'Sashimi', name: 'Chutoro Sashimi', slug: 'chutoro-sashimi', description: 'Medium-fatty bluefin tuna', priceAmount: 690, imageAssetId: 'media-kiku-chutoro-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-uni-sashimi', section: 'Sashimi', name: 'Uni Sashimi 30g', slug: 'uni-sashimi-30g', description: 'Sea urchin, 30g', priceAmount: 680, imageAssetId: 'media-kiku-uni-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-tuna-sashimi', section: 'Sashimi', name: 'Tuna Sashimi', slug: 'tuna-sashimi', description: 'Tuna', priceAmount: 340, imageAssetId: 'media-kiku-tuna-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-akagai-sashimi', section: 'Sashimi', name: 'Akagai Sashimi', slug: 'akagai-sashimi', description: 'Ark shell clam', priceAmount: 290, imageAssetId: 'media-kiku-akagai-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-nori-seaweed', section: 'Sashimi', name: 'Nori Seaweed', slug: 'nori-seaweed', description: 'Seaweed', priceAmount: 50, imageAssetId: 'media-kiku-nori-seaweed', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-toro-salmon-sashimi', section: 'Sashimi', name: 'Toro Salmon Sashimi', slug: 'toro-salmon-sashimi', description: 'Toro salmon', priceAmount: 340, imageAssetId: 'media-kiku-toro-salmon-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-kinki-sashimi', section: 'Sashimi', name: 'Kinki Sashimi', slug: 'kinki-sashimi', description: 'Kinki fish, half fish', priceAmount: 890, imageAssetId: 'media-kiku-kinki-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-hotate-sashimi', section: 'Sashimi', name: 'Hotate Sashimi', slug: 'hotate-sashimi', description: 'Scallop', priceAmount: 370, imageAssetId: 'media-kiku-hotate-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-herring-sashimi', section: 'Sashimi', name: 'Herring Sashimi', slug: 'herring-sashimi', description: 'Herring', priceAmount: 360, imageAssetId: 'media-kiku-herring-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-akami-sashimi', section: 'Sashimi', name: 'Akami Sashimi', slug: 'akami-sashimi', description: 'Lean bluefin tuna', priceAmount: 490, imageAssetId: 'media-kiku-akami-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-ama-ebi-sashimi', section: 'Sashimi', name: 'Ama Ebi Sashimi', slug: 'ama-ebi-sashimi', description: 'Sweet shrimp', priceAmount: 300, imageAssetId: 'media-kiku-ama-ebi-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-salmon-sashimi', section: 'Sashimi', name: 'Salmon Sashimi', slug: 'salmon-sashimi', description: 'Salmon', priceAmount: 300, imageAssetId: 'media-kiku-salmon-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-seabass-sashimi', section: 'Sashimi', name: 'Seabass Sashimi', slug: 'seabass-sashimi', description: 'White seabass', priceAmount: 300, imageAssetId: 'media-kiku-seabass-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-ankimo-sashimi', section: 'Sashimi', name: 'Ankimo Sashimi', slug: 'ankimo-sashimi', description: 'Monkfish liver', priceAmount: 450, imageAssetId: 'media-kiku-ankimo-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-ika-sashimi', section: 'Sashimi', name: 'Ika Sashimi', slug: 'ika-sashimi', description: 'Squid with nori seaweed', priceAmount: 290, imageAssetId: 'media-kiku-ika-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-ikura-sashimi', section: 'Sashimi', name: 'Ikura Sashimi', slug: 'ikura-sashimi', description: 'Salmon roe, 40g', priceAmount: 430, imageAssetId: 'media-kiku-ikura-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-katsuo-sashimi', section: 'Sashimi', name: 'Katsuo Sashimi', slug: 'katsuo-sashimi', description: 'Bonito / skipjack tuna', priceAmount: 340, imageAssetId: 'media-kiku-katsuo-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-otoro-sashimi', section: 'Sashimi', name: 'Otoro Sashimi', slug: 'otoro-sashimi', description: 'Fatty bluefin tuna', priceAmount: 880, imageAssetId: 'media-kiku-otoro-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-madai-sashimi', section: 'Sashimi', name: 'Madai Sashimi', slug: 'madai-sashimi', description: 'Sea bream', priceAmount: 370, imageAssetId: 'media-kiku-madai-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-hamachi-sashimi', section: 'Sashimi', name: 'Hamachi Sashimi', slug: 'hamachi-sashimi', description: 'Yellowtail', priceAmount: 390, imageAssetId: 'media-kiku-hamachi-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-shime-saba-sashimi', section: 'Sashimi', name: 'Shime Saba Sashimi', slug: 'shime-saba-sashimi', description: 'Marinated mackerel', priceAmount: 270, imageAssetId: 'media-kiku-shime-saba-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-tako-sashimi', section: 'Sashimi', name: 'Tako Sashimi', slug: 'tako-sashimi', description: 'Octopus', priceAmount: 320, imageAssetId: 'media-kiku-tako-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-tobiko-sashimi', section: 'Sashimi', name: 'Tobiko Sashimi', slug: 'tobiko-sashimi', description: 'Flying fish roe, 40g', priceAmount: 350, imageAssetId: 'media-kiku-tobiko-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-tamagoyaki-sashimi', section: 'Sashimi', name: 'Tamagoyaki Sashimi', slug: 'tamagoyaki-sashimi', description: 'Japanese omelet / sweet egg', priceAmount: 130, imageAssetId: 'media-kiku-tamagoyaki-sashimi', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-omakase-sashimi-3', section: 'Sashimi', name: 'Omakase Sashimi 3 Kinds', slug: 'omakase-sashimi-3-kinds', description: "Chef's selection, 3 kinds", priceAmount: 710, imageAssetId: 'media-kiku-omakase-sashimi-3', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-omakase-sashimi-5', section: 'Sashimi', name: 'Omakase Sashimi 5 Kinds', slug: 'omakase-sashimi-5-kinds', description: "Chef's selection, 5 kinds", priceAmount: 1200, imageAssetId: 'media-kiku-omakase-sashimi-5', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-omakase-sashimi-7', section: 'Sashimi', name: 'Omakase Sashimi 7 Kinds', slug: 'omakase-sashimi-7-kinds', description: "Chef's selection, 7 kinds", priceAmount: 1650, imageAssetId: 'media-kiku-omakase-sashimi-7', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-omakase-sashimi-9', section: 'Sashimi', name: 'Omakase Sashimi 9 Kinds', slug: 'omakase-sashimi-9-kinds', description: "Chef's selection, 9 kinds", priceAmount: 1650, imageAssetId: 'media-kiku-omakase-sashimi-9', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        // Carpaccio / Usuzukuri
        { id: 'item-kiku-salmon-tuna-hamachi-usuzukuri', section: 'Carpaccio / Usuzukuri', name: 'Salmon, Tuna, Hamachi Usuzukuri', slug: 'salmon-tuna-hamachi-usuzukuri', description: 'Salmon, tuna, and hamachi carpaccio, ponzu sauce', priceAmount: 490, imageAssetId: 'media-kiku-salmon-tuna-hamachi-usuzukuri', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-salmon-usuzukuri', section: 'Carpaccio / Usuzukuri', name: 'Salmon Usuzukuri', slug: 'salmon-usuzukuri', description: 'Salmon carpaccio, ponzu sauce', priceAmount: 450, imageAssetId: 'media-kiku-salmon-usuzukuri', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-hamachi-usuzukuri', section: 'Carpaccio / Usuzukuri', name: 'Hamachi Usuzukuri', slug: 'hamachi-usuzukuri', description: 'Hamachi carpaccio, ponzu sauce', priceAmount: 480, imageAssetId: 'media-kiku-hamachi-usuzukuri', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        // Oishii
        { id: 'item-kiku-pirikara-yakko-tofu', section: 'Oishii', name: 'Pirikara Yakko (Tofu)', slug: 'pirikara-yakko-tofu', description: 'Spicy chilled tofu', priceAmount: 170, imageAssetId: 'media-kiku-pirikara-tofu', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-pirikara-kyuri', section: 'Oishii', name: 'Pirikara Kyuri', slug: 'pirikara-kyuri', description: 'Japanese cucumber salad with dried bonito', priceAmount: 85, imageAssetId: 'media-kiku-pirikara-kyuri', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-pirikara-yakko-jellyfish', section: 'Oishii', name: 'Pirikara Yakko (Jellyfish)', slug: 'pirikara-yakko-jellyfish', description: 'Spicy jellyfish with sesame oil', priceAmount: 130, imageAssetId: 'media-kiku-pirikara-jellyfish', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-ebi-yaki', section: 'Oishii', name: 'Ebi Yaki', slug: 'ebi-yaki', description: 'Grilled shrimp', priceAmount: 50, imageAssetId: 'media-kiku-ebi-yaki', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-mentaiko', section: 'Oishii', name: 'Mentaiko', slug: 'mentaiko', description: 'Cod roe / mentaiko', priceAmount: 260, imageAssetId: 'media-kiku-mentaiko', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-ebi-roll', section: 'Oishii', name: 'Ebi Vegetables Roll Mayonnaise Wasabi Dip', slug: 'ebi-vegetables-roll-mayonnaise-wasabi-dip', description: 'Shrimp and vegetable roll with mayonnaise wasabi dip', priceAmount: 125, imageAssetId: 'media-kiku-ebi-roll', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        // Tataki
        { id: 'item-kiku-tuna-tataki', section: 'Tataki', name: 'Tuna Tataki', slug: 'tuna-tataki', description: 'Seared tuna', priceAmount: 380, imageAssetId: 'media-kiku-tuna-tataki', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-wagyu-tataki', section: 'Tataki', name: 'Wagyu Rump Beef Tataki', slug: 'wagyu-rump-beef-tataki', description: 'Seared wagyu rump beef', priceAmount: 480, imageAssetId: 'media-kiku-wagyu-tataki', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        // Dessert
        { id: 'item-kiku-mango-sticky-rice-roll', section: 'Dessert', name: 'Mango Sticky Rice Roll', slug: 'mango-sticky-rice-roll', description: 'Mango sticky rice roll', priceAmount: 280, imageAssetId: 'media-kiku-mango-sticky-rice-roll', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-chocolate-lava', section: 'Dessert', name: 'Mini Chocolate Lava Vanilla Ice-cream', slug: 'mini-chocolate-lava-vanilla-ice-cream', description: 'Mini chocolate lava cake with vanilla ice cream', priceAmount: 165, imageAssetId: 'media-kiku-chocolate-lava', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-rum-raisin-ice-cream', section: 'Dessert', name: 'Rum & Raisin Ice-cream', slug: 'rum-raisin-ice-cream', description: 'Rum raisin ice cream', priceAmount: 75, imageAssetId: 'media-kiku-rum-raisin-ice-cream', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
        { id: 'item-kiku-vanilla-ice-cream', section: 'Dessert', name: 'Vanilla Ice-cream', slug: 'vanilla-ice-cream', description: 'Vanilla ice cream', priceAmount: 75, imageAssetId: 'media-kiku-vanilla-ice-cream', allergens: null, dietaryNotes: null, available: true, sortOrder: 0 },
      ],
    },
  ],
  locationQa: [],
  posts: [],
  publicRoutes: [
    {
      path: '/',
      title: /Kikuzuki Krabi Thailand/,
      text: 'Kikuzuki',
    },
    {
      path: '/menu',
      title: /Kikuzuki Krabi Thailand/,
      text: 'Sushi',
    },
  ],
  aiCredits: {
    balance: 302,
    lifetimeUsed: 198,
  },
  organizationBilling: {
    status: 'free',
    plan: 'free',
  },
}

export const compiledKikuzukiSeed = compileCuratedSiteFixture(kikuzukiFixture)

export function renderKikuzukiCoreSeedBlock(): string {
  const { site, identity } = compiledKikuzukiSeed

  const siteConfigRows = compiledKikuzukiSeed.siteConfig
    .map((entry) => `  (${[
      sqlValue(identity.organizationId),
      sqlValue(identity.siteId),
      sqlValue(entry.key),
      sqlValue(entry.value),
    ].join(', ')})`)
    .join(',\n')

  const siteLocaleRows = compiledKikuzukiSeed.siteLocales
    .map((entry) => `  (${[
      sqlValue(entry.id),
      sqlValue(identity.organizationId),
      sqlValue(identity.siteId),
      sqlValue(entry.locale),
      sqlValue(entry.label),
      sqlValue(entry.isSource),
      sqlValue(entry.status),
      sqlValue(entry.fallbackEnabled),
    ].join(', ')})`)
    .join(',\n')

  const siteDomainRows = compiledKikuzukiSeed.siteDomains
    .map((entry) => `  (${[
      sqlValue(entry.id),
      sqlValue(identity.organizationId),
      sqlValue(identity.siteId),
      sqlValue(entry.domain),
      sqlValue(entry.type),
      sqlValue(entry.role),
      sqlValue(entry.status),
      sqlValue(entry.dnsStatus),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: kikuzuki_core
INSERT OR REPLACE INTO sites (
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
  NULL,
  ${sqlValue(site.defaultCurrency)},
  ${sqlValue(site.vertical)},
  ${sqlValue(site.contentSource)},
  ${sqlValue(site.mediaSource)}
);

INSERT OR REPLACE INTO site_config (organization_id, site_id, key, value)
VALUES
${siteConfigRows};

INSERT OR REPLACE INTO site_locales
  (id, organization_id, site_id, locale, label, is_source, status, fallback_enabled)
VALUES
${siteLocaleRows};

INSERT OR REPLACE INTO site_domains (id, organization_id, site_id, domain, type, role, status, dns_status)
VALUES
${siteDomainRows};
-- END GENERATED: kikuzuki_core`
}

export function renderKikuzukiMediaBlock(): string {
  const { identity } = compiledKikuzukiSeed

  const mediaRows = compiledKikuzukiSeed.mediaAssets
    .map((media) => `  (${[
      sqlValue(media.id),
      sqlValue(identity.organizationId),
      sqlValue(identity.siteId),
      sqlValue(media.locationId),
      sqlValue(media.kind),
      sqlValue(media.provider),
      sqlValue(media.source),
      sqlValue(media.cloudflareImageId),
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

  const locationRows = compiledKikuzukiSeed.locations
    .map((location) => `  (${[
      sqlValue(location.id),
      sqlValue(identity.organizationId),
      sqlValue(identity.siteId),
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
      sqlValue(location.heroImageAssetId ?? null),
      sqlValue(location.heroVideoAssetId ?? null),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: kikuzuki_media
INSERT OR REPLACE INTO media_assets
  (id, organization_id, site_id, location_id,
   kind, provider, source,
   cloudflare_image_id, r2_key, public_url, thumbnail_url,
   mime_type, file_name, alt_text, category, status)
VALUES
${mediaRows};

INSERT OR REPLACE INTO business_locations (
  id, organization_id, site_id, slug, title, city,
  address, phone, email, maps_url,
  latitude, longitude,
  description, short_description,
  opening_hours,
  rating, review_count,
  price_level, categories,
  instagram_url, facebook_url,
  is_primary, status,
  hero_image_asset_id, hero_video_asset_id
) VALUES
${locationRows};

UPDATE sites SET logo_asset_id = ${sqlValue(compiledKikuzukiSeed.site.logoAssetId ?? null)}, primary_location_id = ${sqlValue(compiledKikuzukiSeed.site.primaryLocationId)} WHERE id = ${sqlValue(identity.siteId)};
-- END GENERATED: kikuzuki_media`
}

export function renderKikuzukiMenuBlock(): string {
  const { identity } = compiledKikuzukiSeed

  const menuRows = compiledKikuzukiSeed.menus
    .map((menu) => `  (${[
      sqlValue(menu.id),
      sqlValue(identity.organizationId),
      sqlValue(identity.siteId),
      sqlValue(menu.locationId),
      sqlValue(menu.name),
      sqlValue(menu.description || null),
      sqlValue(menu.status),
      sqlJson(menu.sectionOrder.length > 0 ? menu.sectionOrder : null),
    ].join(', ')})`)
    .join(',\n')

  const allItems = compiledKikuzukiSeed.menus.flatMap((menu) => menu.items)
  const itemRows = allItems
    .map((item) => `  (${[
      sqlValue(item.id),
      sqlValue(item.menuId),
      sqlValue(item.section),
      sqlValue(item.name),
      sqlValue(item.slug),
      sqlValue(item.description),
      sqlValue(item.priceAmount),
      sqlValue(item.imageAssetId),
      sqlValue(item.available),
      sqlValue(item.allergens),
      sqlValue(item.dietaryNotes),
      sqlValue(item.sortOrder),
    ].join(', ')})`)
    .join(',\n')

  return `-- BEGIN GENERATED: kikuzuki_menu
INSERT OR REPLACE INTO menus (id, organization_id, site_id, location_id, name, description, status, section_order)
VALUES
${menuRows};

INSERT OR IGNORE INTO menu_items
  (id, menu_id, section, name, slug, description,
   price_amount, image_asset_id, available,
   allergens, dietary_notes, sort_order)
VALUES
${itemRows};
-- END GENERATED: kikuzuki_menu`
}

export function renderKikuzukiContentBlock(): string {
  const { identity } = compiledKikuzukiSeed

  const contentRows = compiledKikuzukiSeed.siteContent
    .map((entry) => `  (${[
      sqlValue(entry.id),
      sqlValue(identity.organizationId),
      sqlValue(identity.siteId),
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

  return `-- BEGIN GENERATED: kikuzuki_content
INSERT OR IGNORE INTO site_content
  (id, organization_id, site_id, location_id,
   page, field, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id,
   type, source)
VALUES
${contentRows};
-- END GENERATED: kikuzuki_content`
}

export function renderKikuzukiBillingBlock(): string {
  const { identity } = compiledKikuzukiSeed
  const { aiCredits, organizationBilling } = compiledKikuzukiSeed

  const parts: string[] = []

  if (aiCredits) {
    parts.push(`INSERT OR REPLACE INTO ai_credits (organization_id, balance, lifetime_used)
VALUES (${sqlValue(identity.organizationId)}, ${aiCredits.balance}, ${aiCredits.lifetimeUsed});`)
  }

  if (organizationBilling) {
    parts.push(renderOrganizationBillingSql(identity.organizationId, organizationBilling, sqlValue))
    parts.push(renderOrganizationEntitlementsSql(identity.organizationId, organizationBilling.plan, sqlValue))
  }

  return `-- BEGIN GENERATED: kikuzuki_billing
${parts.join('\n\n')}
-- END GENERATED: kikuzuki_billing`
}
