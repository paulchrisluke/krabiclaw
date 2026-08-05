CREATE TABLE `subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`plan` text NOT NULL,
	`referenceId` text NOT NULL,
	`stripeCustomerId` text,
	`stripeSubscriptionId` text,
	`status` text DEFAULT 'incomplete' NOT NULL,
	`periodStart` integer,
	`periodEnd` integer,
	`trialStart` integer,
	`trialEnd` integer,
	`cancelAtPeriodEnd` integer DEFAULT 0 NOT NULL,
	`cancelAt` integer,
	`canceledAt` integer,
	`endedAt` integer,
	`seats` integer,
	`billingInterval` text,
	`stripeScheduleId` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_stripeSubscriptionId_unique` ON `subscription` (`stripeSubscriptionId`);--> statement-breakpoint
CREATE INDEX `subscription_referenceId_idx` ON `subscription` (`referenceId`);--> statement-breakpoint
CREATE INDEX `subscription_status_idx` ON `subscription` (`status`);--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text,
	`resource` text NOT NULL,
	`source` text NOT NULL,
	`provider` text,
	`channel` text,
	`quantity` integer NOT NULL,
	`unit` text NOT NULL,
	`metadata_json` text,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `usage_events_organization_resource_created_idx` ON `usage_events` (`organization_id`,`resource`,`created_at`);--> statement-breakpoint
CREATE INDEX `usage_events_site_created_idx` ON `usage_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `usage_events_organization_id_idempotency_key_unique` ON `usage_events` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `usage_quota_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`resource` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit` text NOT NULL,
	`period_key` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text,
	`grant_type` text NOT NULL,
	`reason` text NOT NULL,
	`created_by` text,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `usage_quota_grants_active_idx` ON `usage_quota_grants` (`organization_id`,`resource`,`period_start`,`period_end`);--> statement-breakpoint
CREATE UNIQUE INDEX `usage_quota_grants_organization_id_idempotency_key_unique` ON `usage_quota_grants` (`organization_id`,`idempotency_key`);--> statement-breakpoint
ALTER TABLE `organization` ADD `stripeCustomerId` text;--> statement-breakpoint
ALTER TABLE `user` ADD `stripeCustomerId` text;--> statement-breakpoint

-- Backfill Better Auth Stripe's organization customer and subscription records
-- from the current app-owned billing projection. The correlated site selection
-- keeps one subscription per organization when historical site rows exist.
UPDATE organization
SET stripeCustomerId = (
  SELECT ob.stripe_customer_id
  FROM organization_billing ob
  WHERE ob.organization_id = organization.id
    AND ob.stripe_customer_id IS NOT NULL
  LIMIT 1
)
WHERE stripeCustomerId IS NULL
  AND EXISTS (
    SELECT 1 FROM organization_billing ob
    WHERE ob.organization_id = organization.id
      AND ob.stripe_customer_id IS NOT NULL
  );--> statement-breakpoint

UPDATE organization_billing
SET stripe_subscription_id = (
  SELECT sb.stripe_subscription_id
  FROM site_billing sb
  WHERE sb.organization_id = organization_billing.organization_id
    AND sb.stripe_subscription_id IS NOT NULL
    AND sb.status IN ('active', 'trialing')
  ORDER BY sb.updated_at DESC, sb.id DESC
  LIMIT 1
),
plan = COALESCE((
  SELECT sb.plan
  FROM site_billing sb
  WHERE sb.organization_id = organization_billing.organization_id
    AND sb.stripe_subscription_id IS NOT NULL
    AND sb.status IN ('active', 'trialing')
  ORDER BY sb.updated_at DESC, sb.id DESC
  LIMIT 1
), plan),
status = COALESCE((
  SELECT sb.status
  FROM site_billing sb
  WHERE sb.organization_id = organization_billing.organization_id
    AND sb.stripe_subscription_id IS NOT NULL
    AND sb.status IN ('active', 'trialing')
  ORDER BY sb.updated_at DESC, sb.id DESC
  LIMIT 1
), status),
updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (
  SELECT 1 FROM site_billing sb
  WHERE sb.organization_id = organization_billing.organization_id
    AND sb.stripe_subscription_id IS NOT NULL
    AND sb.status IN ('active', 'trialing')
);--> statement-breakpoint

INSERT INTO subscription
  (id, plan, referenceId, stripeCustomerId, stripeSubscriptionId, status, cancelAtPeriodEnd)
SELECT
  'legacy-' || sb.stripe_subscription_id,
  sb.plan,
  sb.organization_id,
  COALESCE(o.stripeCustomerId, ob.stripe_customer_id, sb.stripe_customer_id),
  sb.stripe_subscription_id,
  sb.status,
  CASE WHEN sb.cancel_at_period_end THEN 1 ELSE 0 END
FROM site_billing sb
JOIN organization o ON o.id = sb.organization_id
LEFT JOIN organization_billing ob ON ob.organization_id = sb.organization_id
WHERE sb.stripe_subscription_id IS NOT NULL
  AND sb.status IN ('active', 'trialing')
  AND sb.id = (
    SELECT latest.id
    FROM site_billing latest
    WHERE latest.organization_id = sb.organization_id
      AND latest.stripe_subscription_id IS NOT NULL
      AND latest.status IN ('active', 'trialing')
    ORDER BY latest.updated_at DESC, latest.id DESC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM subscription existing
    WHERE existing.referenceId = sb.organization_id
       OR existing.stripeSubscriptionId = sb.stripe_subscription_id
  );--> statement-breakpoint

INSERT INTO organization_entitlements
  (id, organization_id, key, value, source, created_at, updated_at)
SELECT
  'org-' || se.organization_id || '-' || se.key,
  se.organization_id,
  se.key,
  se.value,
  'migration',
  se.created_at,
  se.updated_at
FROM site_entitlements se
WHERE NOT EXISTS (
  SELECT 1
  FROM organization_entitlements oe
  WHERE oe.organization_id = se.organization_id
    AND oe.key = se.key
);
