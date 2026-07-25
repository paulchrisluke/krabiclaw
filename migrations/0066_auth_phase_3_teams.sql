CREATE TABLE IF NOT EXISTS `team` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`organizationId` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `team_organizationId_idx` ON `team` (`organizationId`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `teamMember` (
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`userId` text NOT NULL,
	`membershipKey` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `teamMember_membershipKey_unique` ON `teamMember` (`membershipKey`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `teamMember_teamId_idx` ON `teamMember` (`teamId`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `teamMember_userId_idx` ON `teamMember` (`userId`);
--> statement-breakpoint
ALTER TABLE `sites` ADD `team_id` text REFERENCES `team`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `business_locations` ADD `team_id` text REFERENCES `team`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `invitation` ADD `teamId` text REFERENCES `team`(`id`) ON DELETE set null;
--> statement-breakpoint
INSERT OR IGNORE INTO `team` (`id`, `name`, `organizationId`, `createdAt`)
SELECT 'site:' || s.id, COALESCE(NULLIF(s.brand_name, ''), s.subdomain, s.id), s.organization_id, unixepoch()
FROM `sites` s;
--> statement-breakpoint
UPDATE `sites`
SET `team_id` = 'site:' || `id`
WHERE `team_id` IS NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `team` (`id`, `name`, `organizationId`, `createdAt`)
SELECT 'location:' || bl.id, COALESCE(NULLIF(bl.title, ''), bl.id), bl.organization_id, unixepoch()
FROM `business_locations` bl;
--> statement-breakpoint
UPDATE `business_locations`
SET `team_id` = 'location:' || `id`
WHERE `team_id` IS NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `teamMember` (`id`, `teamId`, `userId`, `membershipKey`, `createdAt`)
SELECT lower(hex(randomblob(16))), s.team_id, m.userId, s.team_id || ':' || m.userId, unixepoch()
FROM `member_access_scope` mas
JOIN `member` m ON m.id = mas.member_id AND m.organizationId = mas.organization_id
JOIN `sites` s ON s.id = mas.site_id AND s.organization_id = mas.organization_id
WHERE mas.location_id IS NULL AND s.team_id IS NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `teamMember` (`id`, `teamId`, `userId`, `membershipKey`, `createdAt`)
SELECT lower(hex(randomblob(16))), bl.team_id, m.userId, bl.team_id || ':' || m.userId, unixepoch()
FROM `member_access_scope` mas
JOIN `member` m ON m.id = mas.member_id AND m.organizationId = mas.organization_id
JOIN `business_locations` bl ON bl.id = mas.location_id AND bl.site_id = mas.site_id AND bl.organization_id = mas.organization_id
WHERE mas.location_id IS NOT NULL AND bl.team_id IS NOT NULL;
--> statement-breakpoint
UPDATE `invitation`
SET `teamId` = (
	SELECT CASE
		WHEN ias.location_id IS NULL THEN s.team_id
		ELSE bl.team_id
	END
	FROM `invitation_access_scope` ias
	JOIN `sites` s ON s.id = ias.site_id AND s.organization_id = ias.organization_id
	LEFT JOIN `business_locations` bl ON bl.id = ias.location_id AND bl.site_id = ias.site_id AND bl.organization_id = ias.organization_id
	WHERE ias.invitation_id = `invitation`.`id`
	GROUP BY ias.invitation_id
	HAVING COUNT(*) = 1
)
WHERE `teamId` IS NULL
  AND EXISTS (SELECT 1 FROM `invitation_access_scope` ias WHERE ias.invitation_id = `invitation`.`id`);
--> statement-breakpoint
DROP TABLE `member_access_scope`;
