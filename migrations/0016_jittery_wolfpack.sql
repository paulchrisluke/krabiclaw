PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- Deduplicate active drafts before adding unique constraint
-- Keep the most recently updated draft per user
DELETE FROM `onboarding_drafts`
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY updated_at DESC) as rn
    FROM `onboarding_drafts`
    WHERE status = 'active'
  ) ranked
  WHERE rn = 1
);

CREATE TABLE `__new_onboarding_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text,
	`name` text NOT NULL,
	`vertical` text DEFAULT 'restaurant' NOT NULL,
	`subdomain_candidate` text,
	`source_type` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`payload_json` text NOT NULL,
	`committed_site_id` text,
	`committed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`committed_site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "onboarding_drafts_status_check" CHECK(status IN ('active', 'committing', 'committed', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_onboarding_drafts`("id", "user_id", "organization_id", "name", "vertical", "subdomain_candidate", "source_type", "status", "payload_json", "committed_site_id", "committed_at", "created_at", "updated_at") SELECT "id", "user_id", "organization_id", "name", "vertical", "subdomain_candidate", "source_type", "status", "payload_json", "committed_site_id", "committed_at", "created_at", "updated_at" FROM `onboarding_drafts`;--> statement-breakpoint
DROP TABLE `onboarding_drafts`;--> statement-breakpoint
ALTER TABLE `__new_onboarding_drafts` RENAME TO `onboarding_drafts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_onboarding_drafts_active_user_unique` ON `onboarding_drafts` (`user_id`) WHERE status = 'active';