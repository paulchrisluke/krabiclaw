export const BLAWBY_REFERENCE_COMMIT = '5908ab3e64f26f799de61ed55371d02f9ec7bc2f'

export const BLAWBY_PARITY_VIEWPORTS = {
  mobile: { width: 390, height: 1200 },
  tablet: { width: 768, height: 1200 },
  desktop: { width: 1440, height: 1200 },
  wide: { width: 1920, height: 1200 },
}

export const BLAWBY_PARITY_ROUTES = {
  home: {
    path: '/',
    sections: ['hero', 'services', 'approach', 'qa', 'reviews', 'articles', 'consultation'],
  },
  services: {
    path: '/services',
    sections: ['page-hero', 'services', 'qa', 'consultation'],
  },
  'service-detail': {
    path: '/services/family',
    sections: ['service-overview', 'features', 'reviews', 'qa', 'related-services', 'consultation'],
  },
  about: {
    path: '/about',
    sections: ['page-hero', 'team', 'shield-divider', 'impact', 'services', 'qa', 'reviews', 'consultation'],
  },
  pricing: {
    path: '/pricing',
    sections: ['page-hero', 'shield-divider', 'pricing', 'qa', 'services', 'consultation'],
  },
  contact: {
    path: '/contact',
    sections: ['page-hero', 'shield-divider', 'contact', 'qa', 'reviews', 'consultation'],
  },
  schedule: {
    path: '/schedule',
    sections: ['schedule-hero', 'guidance', 'qa', 'reviews', 'consultation'],
  },
  blog: {
    path: '/blog',
    sections: ['page-hero', 'shield-divider', 'articles', 'disclaimer', 'qa', 'consultation'],
  },
  article: {
    path: '/article/preparing-for-your-consultation',
    sections: ['article-header', 'article-body', 'related-articles', 'consultation'],
  },
  donate: {
    path: '/donate',
    sections: ['page-hero', 'shield-divider', 'donation', 'qa'],
  },
  privacy: {
    path: '/policies/privacy',
    sections: ['page-hero', 'legal-content'],
  },
  terms: {
    path: '/policies/terms',
    sections: ['page-hero', 'legal-content'],
  },
  notices: {
    path: '/third-party-notices',
    sections: ['page-hero', 'notices', 'consultation'],
  },
}

export const BLAWBY_PARITY_MAX_DIFF_RATIO = 0.005
export const BLAWBY_PARITY_COLOR_THRESHOLD = 16
