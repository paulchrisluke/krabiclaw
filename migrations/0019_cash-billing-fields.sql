-- Migration number: 0019	 2026-06-19
-- Add stripe_customer_id and cash payment tracking fields to site_billing.
-- stripe_customer_id was referenced in cash-payment.post.ts but missing from 0017.
-- payment_method/local_rate/local_currency support cash (in-person) billing.
-- last_reminder_sent_at gates the daily billing reminder cron.

ALTER TABLE site_billing ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE site_billing ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'stripe';
ALTER TABLE site_billing ADD COLUMN local_rate INTEGER;
ALTER TABLE site_billing ADD COLUMN local_currency TEXT;
ALTER TABLE site_billing ADD COLUMN last_reminder_sent_at TEXT;
