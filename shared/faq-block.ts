/** Which published Q&A records a FAQ block lists: the page's own, or the site-wide set (`scope_path IS NULL`). */
export const FAQ_BLOCK_SOURCES = ['page_qa', 'site_qa'] as const
export type FaqBlockSource = typeof FAQ_BLOCK_SOURCES[number]

export const FAQ_BLOCK_SOURCE_LABELS: Record<FaqBlockSource, string> = {
  page_qa: "This page's questions",
  site_qa: 'Site-wide questions',
}
