import type { TranslationScope } from '~/server/utils/translation-inventory'

export function parseScope(value: unknown): TranslationScope {
  return value === 'content' || value === 'menus' || value === 'locations' || value === 'posts' || value === 'site'
    ? value
    : 'site'
}
