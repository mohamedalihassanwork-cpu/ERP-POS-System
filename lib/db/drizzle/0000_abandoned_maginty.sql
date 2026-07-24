CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`address` text,
	`city` text,
	`currency` text DEFAULT 'EGP' NOT NULL,
	`tax_rate` text DEFAULT '0' NOT NULL,
	`logo_url` text,
	`receipt_printer_width` text DEFAULT '80mm' NOT NULL,
	`receipt_paper_type` text,
	`is_setup_complete` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`name_ar` text,
	`permissions` text DEFAULT '[]' NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_store_name_unique` ON `roles` (`store_id`,`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`role_id` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`full_name` text NOT NULL,
	`phone` text,
	`email` text,
	`is_active` integer DEFAULT true NOT NULL,
	`failed_login_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`last_login_at` integer,
	`is_deleted` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_store_username_unique` ON `users` (`store_id`,`username`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`user_id` text NOT NULL,
	`refresh_token_hash` text NOT NULL,
	`user_agent` text,
	`ip_address` text,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_token_hash_idx` ON `sessions` (`refresh_token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`old_value` text,
	`new_value` text,
	`ip_address` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_logs_store_entity_idx` ON `audit_logs` (`store_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_store_created_idx` ON `audit_logs` (`store_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `brands` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`name_en` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brands_store_name_unique` ON `brands` (`store_id`,`name`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`name_en` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_store_name_unique` ON `categories` (`store_id`,`name`);--> statement-breakpoint
CREATE TABLE `colors` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`name_en` text,
	`hex` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `colors_store_name_unique` ON `colors` (`store_id`,`name`);--> statement-breakpoint
CREATE TABLE `sizes` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`system` text DEFAULT 'EU' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sizes_store_system_name_unique` ON `sizes` (`store_id`,`system`,`name`);--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`address` text,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `warehouses_store_name_unique` ON `warehouses` (`store_id`,`name`);--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`store_id` text NOT NULL,
	`color_id` text NOT NULL,
	`size_id` text NOT NULL,
	`sku` text NOT NULL,
	`barcode` text NOT NULL,
	`selling_price` text,
	`cost_price` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`color_id`) REFERENCES `colors`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`size_id`) REFERENCES `sizes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `variants_store_sku_unique` ON `product_variants` (`store_id`,`sku`);--> statement-breakpoint
CREATE UNIQUE INDEX `variants_store_barcode_unique` ON `product_variants` (`store_id`,`barcode`);--> statement-breakpoint
CREATE UNIQUE INDEX `variants_product_color_size_unique` ON `product_variants` (`product_id`,`color_id`,`size_id`);--> statement-breakpoint
CREATE INDEX `variants_product_idx` ON `product_variants` (`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`name_en` text,
	`category_id` text NOT NULL,
	`brand_id` text,
	`description` text,
	`base_price` text DEFAULT '0' NOT NULL,
	`base_cost_price` text DEFAULT '0' NOT NULL,
	`reorder_point` integer DEFAULT 0 NOT NULL,
	`barcode` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `products_store_name_idx` ON `products` (`store_id`,`name`);--> statement-breakpoint
CREATE INDEX `products_store_category_idx` ON `products` (`store_id`,`category_id`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_items_variant_warehouse_unique` ON `inventory_items` (`variant_id`,`warehouse_id`);--> statement-breakpoint
CREATE INDEX `inventory_items_store_idx` ON `inventory_items` (`store_id`);--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`type` text NOT NULL,
	`quantity_change` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reference_type` text,
	`reference_id` text,
	`notes` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `movements_variant_warehouse_store_idx` ON `inventory_movements` (`variant_id`,`warehouse_id`,`store_id`);--> statement-breakpoint
CREATE INDEX `movements_reference_idx` ON `inventory_movements` (`reference_id`,`reference_type`);--> statement-breakpoint
CREATE INDEX `movements_store_created_idx` ON `inventory_movements` (`store_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `customer_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`type` text NOT NULL,
	`debit` text DEFAULT '0' NOT NULL,
	`credit` text DEFAULT '0' NOT NULL,
	`balance_after` text NOT NULL,
	`reference_type` text,
	`reference_id` text,
	`description` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `customer_tx_customer_idx` ON `customer_transactions` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `customer_tx_store_idx` ON `customer_transactions` (`store_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`address` text,
	`credit_limit` text DEFAULT '0' NOT NULL,
	`current_balance` text DEFAULT '0' NOT NULL,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `customers_store_name_idx` ON `customers` (`store_id`,`name`);--> statement-breakpoint
CREATE INDEX `customers_store_phone_idx` ON `customers` (`store_id`,`phone`);--> statement-breakpoint
CREATE TABLE `supplier_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`type` text NOT NULL,
	`debit` text DEFAULT '0' NOT NULL,
	`credit` text DEFAULT '0' NOT NULL,
	`balance_after` text NOT NULL,
	`reference_type` text,
	`reference_id` text,
	`description` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `supplier_tx_supplier_idx` ON `supplier_transactions` (`supplier_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `supplier_tx_store_idx` ON `supplier_transactions` (`store_id`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`address` text,
	`tax_number` text,
	`current_balance` text DEFAULT '0' NOT NULL,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `suppliers_store_name_idx` ON `suppliers` (`store_id`,`name`);--> statement-breakpoint
CREATE INDEX `suppliers_store_phone_idx` ON `suppliers` (`store_id`,`phone`);--> statement-breakpoint
CREATE TABLE `treasury_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`balance` text DEFAULT '0' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `treasury_accounts_store_type_unique` ON `treasury_accounts` (`store_id`,`type`);--> statement-breakpoint
CREATE TABLE `treasury_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`treasury_account_id` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`opening_balance` text DEFAULT '0' NOT NULL,
	`expected_closing_balance` text,
	`actual_closing_balance` text,
	`variance` text,
	`notes` text,
	`opened_by` text,
	`closed_by` text,
	`opened_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`treasury_account_id`) REFERENCES `treasury_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`opened_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `treasury_sessions_account_idx` ON `treasury_sessions` (`treasury_account_id`,`status`);--> statement-breakpoint
CREATE INDEX `treasury_sessions_store_idx` ON `treasury_sessions` (`store_id`);--> statement-breakpoint
CREATE TABLE `treasury_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`treasury_account_id` text NOT NULL,
	`session_id` text,
	`direction` text NOT NULL,
	`amount` text NOT NULL,
	`balance_after` text NOT NULL,
	`reference_type` text NOT NULL,
	`reference_id` text,
	`description` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`treasury_account_id`) REFERENCES `treasury_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`session_id`) REFERENCES `treasury_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `treasury_tx_account_idx` ON `treasury_transactions` (`treasury_account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `treasury_tx_store_created_idx` ON `treasury_transactions` (`store_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `treasury_tx_reference_idx` ON `treasury_transactions` (`reference_id`,`reference_type`);--> statement-breakpoint
CREATE TABLE `accounting_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`name_en` text,
	`type` text NOT NULL,
	`normal_balance` text NOT NULL,
	`is_contra` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounting_accounts_store_code_unique` ON `accounting_accounts` (`store_id`,`code`);--> statement-breakpoint
CREATE TABLE `accounting_transaction_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`account_id` text NOT NULL,
	`debit` text DEFAULT '0' NOT NULL,
	`credit` text DEFAULT '0' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`transaction_id`) REFERENCES `accounting_transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounting_accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `accounting_lines_tx_idx` ON `accounting_transaction_lines` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `accounting_lines_account_idx` ON `accounting_transaction_lines` (`account_id`);--> statement-breakpoint
CREATE TABLE `accounting_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`entry_date` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`description` text,
	`reference_type` text,
	`reference_id` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `accounting_tx_store_date_idx` ON `accounting_transactions` (`store_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `accounting_tx_reference_idx` ON `accounting_transactions` (`reference_id`,`reference_type`);--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` text NOT NULL,
	`unit_cost` text DEFAULT '0' NOT NULL,
	`discount_amount` text DEFAULT '0' NOT NULL,
	`line_total` text NOT NULL,
	`returned_quantity` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `invoice_items_invoice_idx` ON `invoice_items` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `invoice_items_variant_idx` ON `invoice_items` (`variant_id`);--> statement-breakpoint
CREATE TABLE `invoice_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`method` text NOT NULL,
	`treasury_account_id` text,
	`amount` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`treasury_account_id`) REFERENCES `treasury_accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `invoice_payments_invoice_idx` ON `invoice_payments` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`invoice_number` text NOT NULL,
	`invoice_barcode` text NOT NULL,
	`customer_id` text,
	`warehouse_id` text NOT NULL,
	`sale_type` text DEFAULT 'CASH' NOT NULL,
	`subtotal` text DEFAULT '0' NOT NULL,
	`discount_amount` text DEFAULT '0' NOT NULL,
	`tax_amount` text DEFAULT '0' NOT NULL,
	`total_amount` text DEFAULT '0' NOT NULL,
	`total_cost` text DEFAULT '0' NOT NULL,
	`amount_paid` text DEFAULT '0' NOT NULL,
	`change_due` text DEFAULT '0' NOT NULL,
	`payment_status` text DEFAULT 'PAID' NOT NULL,
	`return_status` text DEFAULT 'NONE' NOT NULL,
	`notes` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_store_number_unique` ON `invoices` (`store_id`,`invoice_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_store_barcode_unique` ON `invoices` (`store_id`,`invoice_barcode`);--> statement-breakpoint
CREATE INDEX `invoices_store_created_idx` ON `invoices` (`store_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `invoices_store_customer_idx` ON `invoices` (`store_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `invoices_created_by_idx` ON `invoices` (`created_by`);--> statement-breakpoint
CREATE TABLE `sales_return_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`return_id` text NOT NULL,
	`invoice_item_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` text NOT NULL,
	`unit_cost` text DEFAULT '0' NOT NULL,
	`line_total` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`return_id`) REFERENCES `sales_returns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_item_id`) REFERENCES `invoice_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `sales_return_items_return_idx` ON `sales_return_items` (`return_id`);--> statement-breakpoint
CREATE TABLE `sales_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`return_number` text NOT NULL,
	`invoice_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`total_amount` text DEFAULT '0' NOT NULL,
	`total_cost` text DEFAULT '0' NOT NULL,
	`refund_method` text DEFAULT 'CASH' NOT NULL,
	`treasury_account_id` text,
	`reason` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`treasury_account_id`) REFERENCES `treasury_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_returns_store_number_unique` ON `sales_returns` (`store_id`,`return_number`);--> statement-breakpoint
CREATE INDEX `sales_returns_invoice_idx` ON `sales_returns` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `sales_returns_store_created_idx` ON `sales_returns` (`store_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `suspended_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`label` text,
	`customer_id` text,
	`cart` text NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`total_amount` text DEFAULT '0' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `suspended_orders_store_idx` ON `suspended_orders` (`store_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `purchase_invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`purchase_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`cost_price` text NOT NULL,
	`line_total` text NOT NULL,
	`returned_quantity` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchase_invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `purchase_items_purchase_idx` ON `purchase_invoice_items` (`purchase_id`);--> statement-breakpoint
CREATE INDEX `purchase_items_variant_idx` ON `purchase_invoice_items` (`variant_id`);--> statement-breakpoint
CREATE TABLE `purchase_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`invoice_number` text NOT NULL,
	`supplier_invoice_number` text,
	`supplier_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`invoice_date` text,
	`due_date` text,
	`subtotal` text DEFAULT '0' NOT NULL,
	`tax_amount` text DEFAULT '0' NOT NULL,
	`total_amount` text DEFAULT '0' NOT NULL,
	`amount_paid` text DEFAULT '0' NOT NULL,
	`remaining_balance` text DEFAULT '0' NOT NULL,
	`status` text DEFAULT 'CONFIRMED' NOT NULL,
	`return_status` text DEFAULT 'NONE' NOT NULL,
	`notes` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_invoices_store_number_unique` ON `purchase_invoices` (`store_id`,`invoice_number`);--> statement-breakpoint
CREATE INDEX `purchase_invoices_store_created_idx` ON `purchase_invoices` (`store_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `purchase_invoices_supplier_idx` ON `purchase_invoices` (`supplier_id`);--> statement-breakpoint
CREATE TABLE `purchase_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`purchase_id` text NOT NULL,
	`method` text NOT NULL,
	`treasury_account_id` text,
	`amount` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchase_invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`treasury_account_id`) REFERENCES `treasury_accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `purchase_payments_purchase_idx` ON `purchase_payments` (`purchase_id`);--> statement-breakpoint
CREATE TABLE `purchase_return_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`return_id` text NOT NULL,
	`purchase_item_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`cost_price` text NOT NULL,
	`line_total` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`return_id`) REFERENCES `purchase_returns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`purchase_item_id`) REFERENCES `purchase_invoice_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `purchase_return_items_return_idx` ON `purchase_return_items` (`return_id`);--> statement-breakpoint
CREATE TABLE `purchase_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`return_number` text NOT NULL,
	`purchase_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`total_amount` text DEFAULT '0' NOT NULL,
	`reason` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchase_invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_returns_store_number_unique` ON `purchase_returns` (`store_id`,`return_number`);--> statement-breakpoint
CREATE INDEX `purchase_returns_purchase_idx` ON `purchase_returns` (`purchase_id`);--> statement-breakpoint
CREATE TABLE `employee_advances` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`amount` text NOT NULL,
	`advance_date` text NOT NULL,
	`notes` text,
	`treasury_account_id` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`treasury_account_id`) REFERENCES `treasury_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `employee_advances_employee_idx` ON `employee_advances` (`employee_id`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`phone` text,
	`job_title` text,
	`monthly_salary` text DEFAULT '0' NOT NULL,
	`advance_balance` text DEFAULT '0' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `employees_store_idx` ON `employees` (`store_id`);--> statement-breakpoint
CREATE TABLE `equity_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` text NOT NULL,
	`movement_date` text NOT NULL,
	`description` text,
	`treasury_account_id` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`treasury_account_id`) REFERENCES `treasury_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `equity_movements_store_idx` ON `equity_movements` (`store_id`,`movement_date`);--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_categories_store_name_unique` ON `expense_categories` (`store_id`,`name`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`category_id` text NOT NULL,
	`amount` text NOT NULL,
	`expense_date` text NOT NULL,
	`description` text,
	`treasury_account_id` text NOT NULL,
	`recorded_by` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`treasury_account_id`) REFERENCES `treasury_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `expenses_store_date_idx` ON `expenses` (`store_id`,`expense_date`);--> statement-breakpoint
CREATE INDEX `expenses_category_idx` ON `expenses` (`category_id`);--> statement-breakpoint
CREATE TABLE `salary_records` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`period_month` text NOT NULL,
	`base_salary` text DEFAULT '0' NOT NULL,
	`deductions` text DEFAULT '0' NOT NULL,
	`bonuses` text DEFAULT '0' NOT NULL,
	`net_amount` text DEFAULT '0' NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`treasury_account_id` text,
	`paid_at` integer,
	`created_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`treasury_account_id`) REFERENCES `treasury_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `salary_records_employee_period_unique` ON `salary_records` (`employee_id`,`period_month`);--> statement-breakpoint
CREATE INDEX `salary_records_store_idx` ON `salary_records` (`store_id`);--> statement-breakpoint
CREATE TABLE `stock_count_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`count_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`expected_quantity` integer NOT NULL,
	`counted_quantity` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`count_id`) REFERENCES `stock_counts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `stock_count_items_count_idx` ON `stock_count_items` (`count_id`);--> statement-breakpoint
CREATE TABLE `stock_counts` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`count_number` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`notes` text,
	`created_by` text NOT NULL,
	`approved_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_counts_store_number_unique` ON `stock_counts` (`store_id`,`count_number`);--> statement-breakpoint
CREATE INDEX `stock_counts_store_idx` ON `stock_counts` (`store_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `warehouse_transfer_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`transfer_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`transfer_id`) REFERENCES `warehouse_transfers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `warehouse_transfer_items_transfer_idx` ON `warehouse_transfer_items` (`transfer_id`);--> statement-breakpoint
CREATE TABLE `warehouse_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`transfer_number` text NOT NULL,
	`from_warehouse_id` text NOT NULL,
	`to_warehouse_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`notes` text,
	`created_by` text NOT NULL,
	`confirmed_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`confirmed_at` integer,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`from_warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`confirmed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `warehouse_transfers_store_number_unique` ON `warehouse_transfers` (`store_id`,`transfer_number`);--> statement-breakpoint
CREATE INDEX `warehouse_transfers_store_idx` ON `warehouse_transfers` (`store_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`severity` text DEFAULT 'INFO' NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`reference_type` text,
	`reference_id` text,
	`dedupe_key` text,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `notifications` (`user_id`,`is_read`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_store_idx` ON `notifications` (`store_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_active_dedupe_idx` ON `notifications` (`user_id`,`dedupe_key`) WHERE "notifications"."is_read" = false AND "notifications"."dedupe_key" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `number_sequences` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`kind` text NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`padding` integer DEFAULT 5 NOT NULL,
	`next_value` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `number_sequences_store_kind_unique` ON `number_sequences` (`store_id`,`kind`);--> statement-breakpoint
CREATE TABLE `store_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`currency` text DEFAULT 'EGP' NOT NULL,
	`tax_enabled` integer DEFAULT false NOT NULL,
	`tax_rate` text DEFAULT '0' NOT NULL,
	`tax_inclusive` integer DEFAULT false NOT NULL,
	`receipt_size` text DEFAULT '80mm' NOT NULL,
	`receipt_footer` text,
	`numeral_format` text DEFAULT 'western' NOT NULL,
	`allow_negative_stock` integer DEFAULT false NOT NULL,
	`allow_below_cost_discount` integer DEFAULT false NOT NULL,
	`allow_negative_treasury` integer DEFAULT false NOT NULL,
	`require_session_for_cash` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_settings_store_unique` ON `store_settings` (`store_id`);