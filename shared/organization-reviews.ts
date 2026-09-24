// Owner-entered review vocabulary, shared by the server, the MCP tools and the
// dashboard so the enum is declared once.
export const OWNER_REVIEW_COLLECTION_METHODS = ['in_person', 'email', 'phone', 'migration', 'other'] as const
export type OwnerReviewCollectionMethod = typeof OWNER_REVIEW_COLLECTION_METHODS[number]

export const OWNER_REVIEW_COLLECTION_METHOD_LABELS: Record<OwnerReviewCollectionMethod, string> = {
  in_person: 'In person',
  email: 'Email',
  phone: 'Phone',
  migration: 'Migration',
  other: 'Other',
}

export const OWNER_REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const
export type OwnerReviewStatus = typeof OWNER_REVIEW_STATUSES[number]
