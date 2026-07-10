# Constrained Blawby Theme Tokens

Blawby should support tenant-specific visual parity through a constrained theme token schema for values such as typography, colors, spacing, and radii. The NCLS React reference tokens can be imported into this schema, but tenants must not be given arbitrary CSS, custom head code, or template-level style overrides to achieve parity.

Decorative geometry that defines Blawby's design, including the inner-page shield divider, is template-owned rather than tenant data. The component contains the reviewed source SVG path, route recipes control where it appears, and validated theme tokens may select its approved fill and adjacent background colors; tenants cannot inject arbitrary SVG paths.

## Considered Options

- Constrained Blawby theme tokens: preserves exact visual direction while keeping rendering predictable, validated, SSR-friendly, and editable through platform surfaces.
- Hardcode NCLS visual tokens into Blawby v1: fastest for one site, but makes Blawby less reusable and hides tenant data inside template code.
- Arbitrary tenant CSS/custom head: maximizes short-term fidelity, but weakens performance, safety, reviewability, and future template guarantees.
