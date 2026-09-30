/** Canonical platform category artwork; social cards derive from these same files. */
export const DOCS_CATEGORY_ART: Record<string, { file: string, alt: string }> = {
  'getting-started': { file: 'krabiclaw-getting-started-category', alt: 'Business details, customization, and publishing setup panels' },
  'build-and-edit': { file: 'krabiclaw-category-build-edit', alt: 'Page editing and brand customization panels' },
  'run-your-business': { file: 'krabiclaw-category-run-business', alt: 'Bookings and customer inquiries panels' },
  'ai-assistants': { file: 'krabiclaw-category-ai-assistants', alt: 'Assistant prompt and review panels' },
  integrations: { file: 'krabiclaw-category-account-settings', alt: 'Account notification preferences and integrations panels' },
}
export function docsCategoryArt(slug: string) {
  const art = DOCS_CATEGORY_ART[slug]
  return art ? { src: `/platform/docs/categories/${art.file}.png`, og: `/platform/docs/categories/${art.file}-og.png`, alt: art.alt } : null
}
