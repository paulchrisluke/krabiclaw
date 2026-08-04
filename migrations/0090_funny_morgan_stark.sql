CREATE TABLE `agent_guidance_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`guidance_run_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`artifact_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`guidance_run_id`) REFERENCES `agent_guidance_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_guidance_artifacts_type_check" CHECK(artifact_type IN ('content_revision', 'media_asset'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_guidance_artifacts_unique` ON `agent_guidance_artifacts` (`guidance_run_id`,`artifact_type`,`artifact_id`);--> statement-breakpoint
CREATE INDEX `agent_guidance_artifacts_artifact_idx` ON `agent_guidance_artifacts` (`artifact_type`,`artifact_id`);--> statement-breakpoint
CREATE TABLE `agent_guidance_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`task` text NOT NULL,
	`candidate_type` text NOT NULL,
	`surface` text NOT NULL,
	`organization_id` text,
	`site_id` text,
	`resolution_fingerprint` text NOT NULL,
	`resolved_skills_json` text NOT NULL,
	`candidate_fingerprint` text NOT NULL,
	`recommendation` text NOT NULL,
	`findings_json` text NOT NULL,
	`review_model` text NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`reviewed_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "agent_guidance_runs_task_check" CHECK(task IN ('blog.write', 'image.generate')),
	CONSTRAINT "agent_guidance_runs_candidate_type_check" CHECK(candidate_type IN ('blog_draft', 'image_brief')),
	CONSTRAINT "agent_guidance_runs_surface_check" CHECK(surface IN ('tenant_mcp', 'platform_mcp', 'dashboard_ai', 'internal_api')),
	CONSTRAINT "agent_guidance_runs_recommendation_check" CHECK(recommendation IN ('ready', 'revise'))
);
--> statement-breakpoint
CREATE INDEX `agent_guidance_runs_site_idx` ON `agent_guidance_runs` (`site_id`,`task`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_guidance_runs_organization_idx` ON `agent_guidance_runs` (`organization_id`,`task`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_guidance_runs_fingerprint_idx` ON `agent_guidance_runs` (`resolution_fingerprint`,`candidate_fingerprint`);--> statement-breakpoint
CREATE TABLE `agent_skill_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`skill_id` text NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`instructions_markdown` text NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`status` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_by_user_id` text,
	`approved_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`activated_at` text,
	FOREIGN KEY (`skill_id`) REFERENCES `agent_skills`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "agent_skill_versions_status_check" CHECK(status IN ('draft', 'active', 'archived')),
	CONSTRAINT "agent_skill_versions_version_check" CHECK(version >= 1),
	CONSTRAINT "agent_skill_versions_name_check" CHECK(length(name) BETWEEN 1 AND 160),
	CONSTRAINT "agent_skill_versions_description_check" CHECK(length(description) BETWEEN 1 AND 1000),
	CONSTRAINT "agent_skill_versions_instructions_check" CHECK(length(cast(instructions_markdown AS blob)) BETWEEN 1 AND 100000),
	CONSTRAINT "agent_skill_versions_priority_check" CHECK(priority BETWEEN 0 AND 1000),
	CONSTRAINT "agent_skill_versions_hash_check" CHECK(length(content_hash) = 64 AND lower(content_hash) = content_hash)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_skill_versions_skill_version_unique` ON `agent_skill_versions` (`skill_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_skill_versions_one_active_unique` ON `agent_skill_versions` (`skill_id`) WHERE status = 'active';--> statement-breakpoint
CREATE INDEX `agent_skill_versions_skill_status_idx` ON `agent_skill_versions` (`skill_id`,`status`);--> statement-breakpoint
CREATE TABLE `agent_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`organization_id` text,
	`site_id` text,
	`task` text NOT NULL,
	`slug` text NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "agent_skills_scope_type_check" CHECK(scope_type IN ('platform', 'organization', 'site')),
	CONSTRAINT "agent_skills_task_check" CHECK(task IN ('blog.write', 'image.generate')),
	CONSTRAINT "agent_skills_scope_target_check" CHECK(
		(scope_type = 'platform' AND organization_id IS NULL AND site_id IS NULL) OR
		(scope_type = 'organization' AND organization_id IS NOT NULL AND site_id IS NULL) OR
		(scope_type = 'site' AND organization_id IS NOT NULL AND site_id IS NOT NULL)
	),
	CONSTRAINT "agent_skills_slug_check" CHECK(slug GLOB '[a-z0-9]*' AND slug NOT GLOB '*[^a-z0-9-]*' AND slug NOT LIKE '%--%' AND slug NOT LIKE '-%' AND slug NOT LIKE '%-')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_skills_platform_identity_unique` ON `agent_skills` (`task`,`slug`) WHERE scope_type = 'platform';--> statement-breakpoint
CREATE UNIQUE INDEX `agent_skills_organization_identity_unique` ON `agent_skills` (`organization_id`,`task`,`slug`) WHERE scope_type = 'organization';--> statement-breakpoint
CREATE UNIQUE INDEX `agent_skills_site_identity_unique` ON `agent_skills` (`organization_id`,`site_id`,`task`,`slug`) WHERE scope_type = 'site';--> statement-breakpoint
CREATE INDEX `agent_skills_resolution_idx` ON `agent_skills` (`task`,`scope_type`,`organization_id`,`site_id`);