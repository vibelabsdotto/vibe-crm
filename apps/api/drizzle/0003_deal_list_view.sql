CREATE TABLE `deal_list_view` (
	`id` integer PRIMARY KEY NOT NULL,
	`columns` text NOT NULL,
	`visibility` text DEFAULT '{}' NOT NULL,
	CONSTRAINT "deal_list_view_singleton" CHECK("deal_list_view"."id" = 1)
);
--> statement-breakpoint
-- Custom data seed generated through Drizzle Kit's --custom workflow.
-- The upgrade links an existing field only. It never creates a definition.
INSERT INTO `deal_list_view` (`id`, `columns`, `visibility`)
SELECT 1,
  '["name","company_name","contact_name","product_name","value","close_date"]',
  CASE WHEN EXISTS (
    SELECT 1 FROM `custom_field_defs`
    WHERE `entity_type` = 'deal' AND `key` = 'lost_reason'
  ) THEN '{"lost_reason":{"mode":"lost"}}' ELSE '{}' END;
