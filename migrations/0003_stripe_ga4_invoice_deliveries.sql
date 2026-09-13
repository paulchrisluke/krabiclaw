CREATE TABLE `stripe_ga4_invoice_deliveries` (
	`stripe_invoice_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'sending' NOT NULL,
	`event_id` text NOT NULL,
	`claimed_at` text,
	`sent_at` text,
	`error` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "stripe_ga4_invoice_deliveries_instants_check" CHECK((claimed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', claimed_at, '+0 days') IS claimed_at) AND (sent_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', sent_at, '+0 days') IS sent_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)),
	CONSTRAINT "stripe_ga4_invoice_deliveries_status_check" CHECK(status IN ('sending', 'sent', 'failed'))
);
