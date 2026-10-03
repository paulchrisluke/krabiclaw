interface PageNode { name?: string; path: string; file?: string; meta?: Record<string, unknown>; children?: PageNode[] }
function find(nodes: PageNode[], target: string, parent = ''): PageNode | undefined {
  for (const node of nodes) {
    const path = node.path.startsWith('/') ? node.path : `${parent}/${node.path}`
    if (path === target) return node
    const child = node.children && find(node.children, target, path)
    if (child) return child
  }
}
/** Mount the existing Product editor at organization scope, without a location. */
export function mountOrganizationProductRoutes(pages: PageNode[]) {
  const existing = find(pages, '/dashboard/:orgSlug()/locations/:locationSlug()/products/:surface()/:collectionId()/:productId()')
  const parent = find(pages, '/dashboard/:orgSlug()/products')
  if (!existing || !parent) throw new Error('Product editor routes were not found')
  function clone(node: PageNode): PageNode {
    return { ...node, name: node.name?.replace('locations-locationSlug-products-surface-collectionId', 'products'), children: node.children?.map(clone) }
  }
  const editor = clone(existing)
  editor.path = ':productId()'
  parent.children = [...(parent.children ?? []), editor]
}
