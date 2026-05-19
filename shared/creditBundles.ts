export const CREDIT_BUNDLES = [
  { credits: 500,  amountCents: 900,  label: '500 credits — $9',      price: '$9' },
  { credits: 2500, amountCents: 2900, label: '2,500 credits — $29',   price: '$29' },
  { credits: 5000, amountCents: 4900, label: '5,000 credits — $49',   price: '$49' },
] as const

export type CreditBundleSize = typeof CREDIT_BUNDLES[number]['credits']

export const BUNDLE_AMOUNTS: Record<number, number> = Object.fromEntries(
  CREDIT_BUNDLES.map(b => [b.credits, b.amountCents])
)
