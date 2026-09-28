import type { PublishedArticleCategory } from '~/composables/usePublishedArticles'

export interface ArticleNav {
  categories: PublishedArticleCategory[]
  indexPath: string
  indexLabel: string
  search: { surface: 'blog' | 'docs' | 'tenant_blog'; variant: 'platform' | 'saya' | 'blawby' } | null
}

/**
 * The navigation of the collection the current page belongs to. The page names
 * its collection in its meta (`articleCollection`); the articles layout reads
 * it here, so going from the blog to the docs changes the list without
 * remounting the layout.
 */
export async function useArticleNav() {
  const route = useRoute()
  const { t, localePath } = useI18n()
  const { template } = usePublicTemplate()
  const publicLocale = useState<string>('public-locale', () => 'en')
  const collection = computed(() => route.meta.articleCollection === 'docs' ? 'docs' as const : 'blog' as const)
  const { categories } = await usePublishedArticles(collection)

  return computed<ArticleNav>(() => ({
    categories: categories.value,
    indexPath: collection.value === 'docs' ? '/docs' : localePath('/blog'),
    indexLabel: collection.value === 'docs' ? 'Docs' : t('saya.footer.blog'),
    // Krabiclaw searches its own blog and docs; a site searches its articles, in English only.
    search: template.value.slug === 'platform'
      ? { surface: collection.value, variant: 'platform' }
      : publicLocale.value === 'en' ? { surface: 'tenant_blog', variant: template.value.slug } : null,
  }))
}
