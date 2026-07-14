# Structured Rules for Calculator Components

Calculator components may influence legal or financial expectations, so their behavior must be reviewable, testable, and importable as data. KrabiClaw calculators will use structured rule configuration for inputs, thresholds, result bands, explanatory copy, CTAs, and source/effective-date notes rather than arbitrary formulas, CMS JavaScript, or tenant-specific custom component code.

## Considered Options

- Structured rules schema: sufficient for FPL/sliding-scale style calculators and safest for review.
- Formula expression builder: more flexible, but requires parsing, sandboxing, and broader QA.
- Custom component per tenant: fast, but creates hidden platform debt and weakens review.
