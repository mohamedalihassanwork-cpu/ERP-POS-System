CREATE TABLE `treasury_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`treasury_account_id` text NOT NULL,
	`direction` text NOT NULL,
	`amount` text NOT NULL,
	`reason` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`treasury_account_id`) REFERENCES `treasury_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `treasury_adjustments_store_idx` ON `treasury_adjustments` (`store_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `treasury_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`from_account_id` text NOT NULL,
	`to_account_id` text NOT NULL,
	`amount` text NOT NULL,
	`description` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`from_account_id`) REFERENCES `treasury_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_account_id`) REFERENCES `treasury_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `treasury_transfers_store_idx` ON `treasury_transfers` (`store_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `association_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`association_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` text NOT NULL,
	`transaction_date` text NOT NULL,
	`treasury_account_id` text NOT NULL,
	`reference_number` text,
	`notes` text,
	`is_reversed` integer DEFAULT false NOT NULL,
	`reversal_of_id` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`association_id`) REFERENCES `associations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`treasury_account_id`) REFERENCES `treasury_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `assoc_tx_association_idx` ON `association_transactions` (`association_id`,`transaction_date`);--> statement-breakpoint
CREATE INDEX `assoc_tx_store_idx` ON `association_transactions` (`store_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `assoc_tx_treasury_idx` ON `association_transactions` (`treasury_account_id`);--> statement-breakpoint
CREATE TABLE `associations` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`start_date` text NOT NULL,
	`end_date` text,
	`expected_return_date` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`contribution_frequency` text DEFAULT 'NONE' NOT NULL,
	`contribution_amount` text,
	`notes` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `associations_store_idx` ON `associations` (`store_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `associations_store_name_unique` ON `associations` (`store_id`,`name`);--> statement-breakpoint
DROP INDEX `salary_records_employee_period_unique`;--> statement-breakpoint
ALTER TABLE `salary_records` ADD `pay_period_type` text DEFAULT 'MONTHLY' NOT NULL;--> statement-breakpoint
ALTER TABLE `salary_records` ADD `advance_deduction` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `salary_records` ADD `other_deductions` text DEFAULT '0' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `salary_records_employee_period_unique` ON `salary_records` (`employee_id`,`period_month`,`pay_period_type`);