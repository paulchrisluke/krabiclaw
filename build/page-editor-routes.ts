// A Product's Page content is the page it owns, edited with the same levels
// Pages uses — sections, blocks, fields, title, summary and URL. One page file
// sits in one place in the route tree, so those levels are mounted a second
// time under the Product's `page` level: the same files, a second set of
// records, the way the booking tree is mounted under the calendar day. The
// levels read which page they edit from the editor above them, not the URL.
import { nodeAt, renamed, type PageNode } from './booking-routes'

const PAGE_EDITOR_PATH = '/dashboard/:orgSlug()/settings/website/pages/:pageId()'
const PRODUCT_PAGE_PATH = '/dashboard/:orgSlug()/products/:productId()/page'

export function mountProductPageRoutes(pages: PageNode[]): void {
  const editor = nodeAt(pages, PAGE_EDITOR_PATH)
  const productPage = nodeAt(pages, PRODUCT_PAGE_PATH)
  if (!editor?.children || !productPage) throw new Error("The page editor and a Product's Page content were not both found; a Product's page cannot be edited")
  productPage.children = [
    ...(productPage.children ?? []),
    ...editor.children.map(child => renamed(child, 'dashboard-orgSlug-settings-website-pages-pageId', 'dashboard-orgSlug-products-productId-page')),
  ]
}
