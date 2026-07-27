CREATE TABLE `guest_thread_sequence_counters` (
	`thread_id` text PRIMARY KEY NOT NULL,
	`next_sequence` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `guest_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
