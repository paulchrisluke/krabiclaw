UPDATE `invitation`
SET `status` = 'canceled'
WHERE `status` = 'pending'
  AND EXISTS (
    SELECT 1
    FROM `invitation` AS newer
    WHERE newer.`organizationId` = `invitation`.`organizationId`
      AND lower(newer.`email`) = lower(`invitation`.`email`)
      AND newer.`status` = 'pending'
      AND (
        newer.`createdAt` > `invitation`.`createdAt`
        OR (newer.`createdAt` = `invitation`.`createdAt` AND newer.`id` > `invitation`.`id`)
      )
  );--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invitation_org_email_pending_unique` ON `invitation` (`organizationId`,lower("email")) WHERE status = 'pending';
