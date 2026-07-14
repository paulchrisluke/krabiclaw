/**
 * Minimal typed shape for the plain-object element tree the renderers build. Satori's own
 * TypeScript signature expects React's `ReactNode`, but at runtime it only ever needs this
 * plain `{ type, props }` shape — server/utils/og-image/render.ts casts to `ReactNode` at the
 * single call boundary rather than pulling JSX/React.createElement into every renderer.
 */
export interface SatoriNode {
  type: string
  props: {
    style?: Record<string, string | number>
    children?: SatoriNode | string | Array<SatoriNode | string | null | false>
    src?: string
    width?: number
    height?: number
  }
}

export function node(
  type: string,
  style: Record<string, string | number> = {},
  children?: SatoriNode['props']['children'],
  attrs?: { src?: string, width?: number, height?: number },
): SatoriNode {
  return { type, props: { style, children, ...attrs } }
}
