export async function completeVerifiedInvitation(options: {
  accept: () => Promise<void>
  isAccepted: () => boolean
  fallback: () => void
}) {
  await options.accept()
  if (!options.isAccepted()) options.fallback()
}
