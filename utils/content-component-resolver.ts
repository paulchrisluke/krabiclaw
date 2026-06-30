import ContentFaqSection from '~/components/content/ContentFaqSection.vue'
import ContentHowToSection from '~/components/content/ContentHowToSection.vue'

export type ContentComponentType = 'faq' | 'how_to'

// Resolved to actual component definitions, not name strings — these aren't
// globally registered, so `<component :is="'ContentHowToSection'">` silently
// renders an empty unknown element instead of the component.
const CONTENT_COMPONENT_REGISTRY: Record<ContentComponentType, typeof ContentFaqSection | typeof ContentHowToSection> = {
  faq: ContentFaqSection,
  how_to: ContentHowToSection,
}

export function resolveContentComponent(type: ContentComponentType) {
  return CONTENT_COMPONENT_REGISTRY[type] ?? null
}
