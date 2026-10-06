CREATE TABLE `workspace_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`company_id` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
-- Drizzle Kit omits referential actions on SQLite ADD COLUMN; match the schema.
ALTER TABLE `subscriptions` ADD `deal_id` text REFERENCES deals(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_subscriptions_deal` ON `subscriptions` (`deal_id`);