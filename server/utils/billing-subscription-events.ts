export function shouldApplySubscriptionDeleted(
  currentSubscriptionId: string | null | undefined,
  deletedSubscriptionId: string | null | undefined,
): boolean {
  return Boolean(
    currentSubscriptionId
    && deletedSubscriptionId
    && currentSubscriptionId === deletedSubscriptionId,
  )
}
