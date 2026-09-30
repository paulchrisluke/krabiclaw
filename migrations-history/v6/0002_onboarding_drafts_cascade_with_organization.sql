-- A draft is the draft of the organization its first save provisioned, so it
-- goes when that organization is deleted. Under SET NULL a deleted site's draft
-- survived as an active, resumable draft (#1113). Drafts already detached by a
-- deleted organization are not carried over: the cascade would have taken them.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_onboarding_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text,
	`name` text NOT NULL,
	`vertical` text NOT NULL,
	`subdomain_candidate` text,
	`source_type` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`payload_json` text NOT NULL,
	`committed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "onboarding_drafts_instants_check" CHECK((committed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', committed_at, '+0 days') IS committed_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)),
	CONSTRAINT "onboarding_drafts_payload_json_check" CHECK(payload_json IS NULL OR (json_valid(payload_json) AND json_type(payload_json) IS 'object'))
);
--> statement-breakpoint
INSERT INTO `__new_onboarding_drafts`("id", "user_id", "organization_id", "name", "vertical", "subdomain_candidate", "source_type", "status", "payload_json", "committed_at", "created_at", "updated_at") SELECT "id", "user_id", "organization_id", "name", "vertical", "subdomain_candidate", "source_type", "status", "payload_json", "committed_at", "created_at", "updated_at" FROM `onboarding_drafts` WHERE "organization_id" IS NOT NULL OR "status" = 'active';--> statement-breakpoint
DROP TABLE `onboarding_drafts`;--> statement-breakpoint
ALTER TABLE `__new_onboarding_drafts` RENAME TO `onboarding_drafts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_onboarding_drafts_active_user_unique` ON `onboarding_drafts` (`user_id`) WHERE status = 'active';--> statement-breakpoint
CREATE INDEX `onboarding_drafts_user_id_idx` ON `onboarding_drafts` (`user_id`);