const SITE_EVENT_LABELS: Record<string, string> = {
  'contact.created': 'New contact message',
  'post.created': 'Created a post',
  'post.published': 'Published a post',
  'post.archived': 'Archived a post',
  'menu.created': 'Created a menu',
  'menu.item_added': 'Added a menu item',
  'menu.item_updated': 'Updated a menu item',
  'menu.item_deleted': 'Deleted a menu item',
  'content.updated': 'Updated content',
  'content.published': 'Published content',
  'media.uploaded': 'Uploaded media',
  'media.deleted': 'Deleted media',
  'review.received': 'New review received',
  'review.replied': 'Replied to a review',
  'reservation.created': 'New reservation',
  'reservation.confirmed': 'Confirmed a reservation',
  'reservation.cancelled': 'Cancelled a reservation',
  'location.created': 'Added a location',
  'location.updated': 'Updated a location',
  'location.gmb_connected': 'Connected Google Business',
  'translation.job_completed': 'Translation completed',
  'experience.created': 'Created an experience',
  'experience.booking_received': 'New experience booking',
  'work_request.created': 'Submitted a work request',
  'work_request.status_changed': 'Updated a work request',
  'domain.connected': 'Connected a domain',
  'domain.verified': 'Domain verified',
  'domain.failed': 'Domain verification failed',
  'member.invited': 'Invited a member',
  'member.role_changed': "Updated a member's role",
  'member.removed': 'Removed a member',
}

export const SITE_EVENT_TYPES = Object.keys(SITE_EVENT_LABELS)

export function useSiteEventLabels() {
  function eventLabel(type: string) {
    return SITE_EVENT_LABELS[type] ?? type.replace('.', ' ')
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return days < 30 ? `${days}d ago` : new Date(dateStr).toLocaleDateString()
  }

  return { eventLabel, timeAgo }
}
