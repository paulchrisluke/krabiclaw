ALTER TABLE `experience_bookings` ADD `location_id` text REFERENCES business_locations(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `notifications` ADD `location_id` text REFERENCES business_locations(id) ON DELETE set null;--> statement-breakpoint
UPDATE experience_bookings
SET location_id = (
  SELECT location_id
  FROM experiences
  WHERE experiences.id = experience_bookings.experience_id
    AND experiences.site_id = experience_bookings.site_id
)
WHERE location_id IS NULL;--> statement-breakpoint
