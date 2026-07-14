# Exact Blawby Visual Parity with Native Vue Implementation

Blawby should match the React reference site's visual and UX design as closely as possible for layout, typography, spacing, sections, CTAs, responsive behavior, and content hierarchy. The implementation must still be native Nuxt/Vue using lightweight KrabiClaw public-surface components, must avoid tenant-page Nuxt UI dependence, and must not copy React components into KrabiClaw.

Parity applies to the shared header and footer and to every migrated route, including the placement and grouping of information within each page. Matching only colors, fonts, or a simplified homepage is not parity.

## Considered Options

- Exact visual/UX parity with native Vue implementation: honors the source design while preserving KrabiClaw architecture and performance rules.
- Literal React component/code port: fastest apparent parity, but violates the migration's non-goal.
- Design-inspired Blawby: cleaner platform authorship, but contradicts the parity requirement.
