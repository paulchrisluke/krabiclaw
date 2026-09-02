CREATE UNIQUE INDEX `prices_product_start_unique` ON `prices` (`product_id`,`valid_from`);--> statement-breakpoint
CREATE UNIQUE INDEX `prices_product_open_unique` ON `prices` (`product_id`) WHERE "prices"."valid_until" IS NULL;
