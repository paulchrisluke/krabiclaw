-- Migration number: 0004 	 2026-06-08T00:00:00.000Z
PRAGMA foreign_keys = OFF;

CREATE TABLE site_transfer_requests_new (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  from_organization_id TEXT NOT NULL,
  to_email TEXT NOT NULL,
  token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled')),
  initiated_by_user_id TEXT NOT NULL,
  accepted_by_user_id TEXT,
  claiming_user_id TEXT,
  claiming_organization_id TEXT,
  message TEXT,
  invited_plan TEXT,
  invited_coupon TEXT,
  invited_domain TEXT,
  requires_payment INTEGER NOT NULL DEFAULT 0,
  stripe_checkout_session_id TEXT,
  payment_completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  last_reminder_at TEXT,
  reminder_count INTEGER NOT NULL DEFAULT 0,
  custom_domains_snapshot TEXT,
  custom_domains_removed_at TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (initiated_by_user_id) REFERENCES user(id),
  FOREIGN KEY (accepted_by_user_id) REFERENCES user(id),
  FOREIGN KEY (claiming_user_id) REFERENCES user(id)
);

INSERT INTO site_transfer_requests_new (
  id,
  site_id,
  from_organization_id,
  to_email,
  token,
  status,
  initiated_by_user_id,
  accepted_by_user_id,
  claiming_user_id,
  claiming_organization_id,
  message,
  invited_plan,
  invited_coupon,
  invited_domain,
  requires_payment,
  stripe_checkout_session_id,
  payment_completed_at,
  created_at,
  completed_at,
  last_reminder_at,
  reminder_count,
  custom_domains_snapshot,
  custom_domains_removed_at
)
SELECT
  id,
  site_id,
  from_organization_id,
  to_email,
  token,
  CASE status
    WHEN 'expired' THEN 'cancelled'
    ELSE status
  END,
  initiated_by_user_id,
  accepted_by_user_id,
  NULL,
  NULL,
  message,
  invited_plan,
  invited_coupon,
  invited_domain,
  CASE WHEN invited_plan IS NOT NULL THEN 1 ELSE 0 END,
  NULL,
  NULL,
  created_at,
  completed_at,
  NULL,
  0,
  NULL,
  NULL
FROM site_transfer_requests;

DROP TABLE site_transfer_requests;
ALTER TABLE site_transfer_requests_new RENAME TO site_transfer_requests;

CREATE UNIQUE INDEX idx_site_transfer_token
  ON site_transfer_requests(token);

CREATE INDEX idx_site_transfer_site
  ON site_transfer_requests(site_id, status);

CREATE UNIQUE INDEX idx_site_transfer_pending
  ON site_transfer_requests(site_id) WHERE status = 'pending';

CREATE INDEX idx_site_transfer_reminders
  ON site_transfer_requests(status, requires_payment, created_at);

PRAGMA foreign_keys = ON;
