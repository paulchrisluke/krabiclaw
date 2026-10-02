import { BUSY_FRESHNESS_MS } from '~/shared/member-scheduling'

/** Session commitment wins over the current offering assignment. */
export function sessionMemberSql(s: string): string {
  return `COALESCE(${s}.assigned_member_id, (SELECT c.assigned_member_id FROM product_booking_configs c WHERE c.organization_id=${s}.organization_id AND c.product_id=${s}.product_id AND c.scheduling_mode='provider'))`
}

/** One occupancy per distinct Session. Group attendees share capacity. */
export function providerUnavailableSql(s: string, replacingBooking = 'NULL', convertingPayment = 'NULL', member = sessionMemberSql(s)): string {
  return `(${member} IS NOT NULL AND (
    NOT EXISTS (SELECT 1 FROM member_scheduling ms JOIN member m ON m.id=ms.member_id AND m.organizationId=ms.organization_id
      WHERE ms.member_id=${member} AND ms.organization_id=${s}.organization_id
      AND ms.windows_until>=${s}.ends_at
      AND EXISTS (SELECT 1 FROM json_each(ms.windows_json) w WHERE json_extract(w.value,'$.start')<=${s}.starts_at AND json_extract(w.value,'$.end')>=${s}.ends_at)
      AND NOT EXISTS (SELECT 1 FROM json_each(ms.time_off_json) t WHERE json_extract(t.value,'$.start')<${s}.ends_at AND json_extract(t.value,'$.end')>${s}.starts_at)
      AND (ms.calendar_account_id IS NULL OR (ms.busy_error IS NULL AND ms.busy_checked_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-${BUSY_FRESHNESS_MS / 1000} seconds')
        AND ms.busy_from<=${s}.starts_at AND ms.busy_until>=${s}.ends_at
        AND EXISTS (SELECT 1 FROM account a WHERE a.id=ms.calendar_account_id AND a.userId=m.userId AND a.providerId='google')
        AND NOT EXISTS (SELECT 1 FROM json_each(ms.busy_json) busy WHERE json_extract(busy.value,'$.start')<${s}.ends_at AND json_extract(busy.value,'$.end')>${s}.starts_at))))
    OR EXISTS (SELECT 1 FROM bookings b JOIN product_sessions occupied ON occupied.id=b.product_session_id AND occupied.organization_id=b.organization_id
      WHERE b.organization_id=${s}.organization_id AND b.assigned_member_id=${member} AND b.status IN ('pending','confirmed')
      AND b.id IS NOT ${replacingBooking} AND occupied.id<>${s}.id AND occupied.starts_at<${s}.ends_at AND occupied.ends_at>${s}.starts_at)
    OR EXISTS (SELECT 1 FROM payment_checkout_holds h WHERE h.organization_id=${s}.organization_id AND h.assigned_member_id=${member}
      AND h.status='active' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND h.payment_id IS NOT ${convertingPayment}
      AND h.session_id<>${s}.id AND h.starts_at<${s}.ends_at AND h.ends_at>${s}.starts_at)
  ))`
}
