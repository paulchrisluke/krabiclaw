export type ContentComponentType = 'faq' | 'how_to'

const CONTENT_COMPONENT_REGISTRY: Record<ContentComponentType, string> = {
  faq: 'ContentFaqSection',
  how_to: 'ContentHowToSection',
}

export function resolveContentComponent(type: ContentComponentType) {
  return CONTENT_COMPONENT_REGISTRY[type] ?? null
}
