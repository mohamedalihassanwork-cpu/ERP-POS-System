import { createClient } from "@libsql/client";

export const FULL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS \`stores\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`phone\` text,
	\`address\` text,
	\`city\` text,
	\`currency\` text DEFAULT 'EGP' NOT NULL,
	\`tax_rate\` text DEFAULT '0' NOT NULL,
	\`logo_url\` text,
	\`receipt_printer_width\` text DEFAULT '80mm' NOT NULL,
	\`receipt_paper_type\` text,
	\`is_setup_complete\` integer DEFAULT false NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE TABLE IF NOT EXISTS \`roles\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`name\` text NOT NULL,
	\`name_ar\` text,
	\`permissions\` text DEFAULT '[]' NOT NULL,
	\`is_system\` integer DEFAULT false NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`roles_store_name_unique\` ON \`roles\` (\`store_id\`,\`name\`);
CREATE TABLE IF NOT EXISTS \`users\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`role_id\` text NOT NULL,
	\`username\` text NOT NULL,
	\`password_hash\` text NOT NULL,
	\`full_name\` text NOT NULL,
	\`phone\` text,
	\`email\` text,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`failed_login_attempts\` integer DEFAULT 0 NOT NULL,
	\`locked_until\` integer,
	\`last_login_at\` integer,
	\`is_deleted\` integer DEFAULT false NOT NULL,
	\`deleted_at\` integer,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`users_store_username_unique\` ON \`users\` (\`store_id\`,\`username\`);
CREATE TABLE IF NOT EXISTS \`sessions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`user_id\` text NOT NULL,
	\`refresh_token_hash\` text NOT NULL,
	\`user_agent\` text,
	\`ip_address\` text,
	\`expires_at\` integer NOT NULL,
	\`revoked_at\` integer,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`sessions_token_hash_idx\` ON \`sessions\` (\`refresh_token_hash\`);
CREATE INDEX IF NOT EXISTS \`sessions_user_idx\` ON \`sessions\` (\`user_id\`);
CREATE TABLE IF NOT EXISTS \`audit_logs\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`user_id\` text,
	\`action\` text NOT NULL,
	\`entity_type\` text,
	\`entity_id\` text,
	\`old_value\` text,
	\`new_value\` text,
	\`ip_address\` text,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`audit_logs_store_entity_idx\` ON \`audit_logs\` (\`store_id\`,\`entity_type\`,\`entity_id\`);
CREATE INDEX IF NOT EXISTS \`audit_logs_store_created_idx\` ON \`audit_logs\` (\`store_id\`,\`created_at\`);
CREATE TABLE IF NOT EXISTS \`brands\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`name\` text NOT NULL,
	\`name_en\` text,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`brands_store_name_unique\` ON \`brands\` (\`store_id\`,\`name\`);
CREATE TABLE IF NOT EXISTS \`categories\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`name\` text NOT NULL,
	\`name_en\` text,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`categories_store_name_unique\` ON \`categories\` (\`store_id\`,\`name\`);
CREATE TABLE IF NOT EXISTS \`colors\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`name\` text NOT NULL,
	\`name_en\` text,
	\`hex\` text,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`colors_store_name_unique\` ON \`colors\` (\`store_id\`,\`name\`);
CREATE TABLE IF NOT EXISTS \`sizes\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`name\` text NOT NULL,
	\`system\` text DEFAULT 'EU' NOT NULL,
	\`sort_order\` integer DEFAULT 0 NOT NULL,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`sizes_store_system_name_unique\` ON \`sizes\` (\`store_id\`,\`system\`,\`name\`);
CREATE TABLE IF NOT EXISTS \`warehouses\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`name\` text NOT NULL,
	\`code\` text,
	\`address\` text,
	\`is_default\` integer DEFAULT false NOT NULL,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`warehouses_store_name_unique\` ON \`warehouses\` (\`store_id\`,\`name\`);
CREATE TABLE IF NOT EXISTS \`products\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`name\` text NOT NULL,
	\`name_en\` text,
	\`category_id\` text NOT NULL,
	\`brand_id\` text,
	\`description\` text,
	\`base_price\` text DEFAULT '0' NOT NULL,
	\`base_cost_price\` text DEFAULT '0' NOT NULL,
	\`reorder_point\` integer DEFAULT 0 NOT NULL,
	\`barcode\` text,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`products_store_name_idx\` ON \`products\` (\`store_id\`,\`name\`);
CREATE INDEX IF NOT EXISTS \`products_store_category_idx\` ON \`products\` (\`store_id\`,\`category_id\`);
CREATE TABLE IF NOT EXISTS \`product_variants\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`product_id\` text NOT NULL,
	\`store_id\` text NOT NULL,
	\`color_id\` text NOT NULL,
	\`size_id\` text NOT NULL,
	\`sku\` text NOT NULL,
	\`barcode\` text NOT NULL,
	\`selling_price\` text,
	\`cost_price\` text,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`variants_store_sku_unique\` ON \`product_variants\` (\`store_id\`,\`sku\`);
CREATE UNIQUE INDEX IF NOT EXISTS \`variants_store_barcode_unique\` ON \`product_variants\` (\`store_id\`,\`barcode\`);
CREATE UNIQUE INDEX IF NOT EXISTS \`variants_product_color_size_unique\` ON \`product_variants\` (\`product_id\`,\`color_id\`,\`size_id\`);
CREATE INDEX IF NOT EXISTS \`variants_product_idx\` ON \`product_variants\` (\`product_id\`);
CREATE TABLE IF NOT EXISTS \`inventory_items\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`variant_id\` text NOT NULL,
	\`warehouse_id\` text NOT NULL,
	\`quantity\` integer DEFAULT 0 NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`inventory_items_variant_warehouse_unique\` ON \`inventory_items\` (\`variant_id\`,\`warehouse_id\`);
CREATE INDEX IF NOT EXISTS \`inventory_items_store_idx\` ON \`inventory_items\` (\`store_id\`);
CREATE TABLE IF NOT EXISTS \`inventory_movements\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`variant_id\` text NOT NULL,
	\`warehouse_id\` text NOT NULL,
	\`type\` text NOT NULL,
	\`quantity_change\` integer NOT NULL,
	\`balance_after\` integer NOT NULL,
	\`reference_type\` text,
	\`reference_id\` text,
	\`notes\` text,
	\`created_by\` text,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`movements_variant_warehouse_store_idx\` ON \`inventory_movements\` (\`variant_id\`,\`warehouse_id\`,\`store_id\`);
CREATE INDEX IF NOT EXISTS \`movements_reference_idx\` ON \`inventory_movements\` (\`reference_id\`,\`reference_type\`);
CREATE INDEX IF NOT EXISTS \`movements_store_created_idx\` ON \`inventory_movements\` (\`store_id\`,\`created_at\`);
CREATE TABLE IF NOT EXISTS \`customers\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`name\` text NOT NULL,
	\`phone\` text NOT NULL,
	\`address\` text,
	\`credit_limit\` text DEFAULT '0' NOT NULL,
	\`current_balance\` text DEFAULT '0' NOT NULL,
	\`notes\` text,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`customers_store_name_idx\` ON \`customers\` (\`store_id\`,\`name\`);
CREATE INDEX IF NOT EXISTS \`customers_store_phone_idx\` ON \`customers\` (\`store_id\`,\`phone\`);
CREATE TABLE IF NOT EXISTS \`customer_transactions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`customer_id\` text NOT NULL,
	\`type\` text NOT NULL,
	\`debit\` text DEFAULT '0' NOT NULL,
	\`credit\` text DEFAULT '0' NOT NULL,
	\`balance_after\` text NOT NULL,
	\`reference_type\` text,
	\`reference_id\` text,
	\`description\` text,
	\`created_by\` text,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`customer_tx_customer_idx\` ON \`customer_transactions\` (\`customer_id\`,\`created_at\`);
CREATE INDEX IF NOT EXISTS \`customer_tx_store_idx\` ON \`customer_transactions\` (\`store_id\`);
CREATE TABLE IF NOT EXISTS \`suppliers\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`name\` text NOT NULL,
	\`phone\` text NOT NULL,
	\`address\` text,
	\`tax_number\` text,
	\`current_balance\` text DEFAULT '0' NOT NULL,
	\`notes\` text,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`suppliers_store_name_idx\` ON \`suppliers\` (\`store_id\`,\`name\`);
CREATE INDEX IF NOT EXISTS \`suppliers_store_phone_idx\` ON \`suppliers\` (\`store_id\`,\`phone\`);
CREATE TABLE IF NOT EXISTS \`supplier_transactions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`supplier_id\` text NOT NULL,
	\`type\` text NOT NULL,
	\`debit\` text DEFAULT '0' NOT NULL,
	\`credit\` text DEFAULT '0' NOT NULL,
	\`balance_after\` text NOT NULL,
	\`reference_type\` text,
	\`reference_id\` text,
	\`description\` text,
	\`created_by\` text,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`supplier_tx_supplier_idx\` ON \`supplier_transactions\` (\`supplier_id\`,\`created_at\`);
CREATE INDEX IF NOT EXISTS \`supplier_tx_store_idx\` ON \`supplier_transactions\` (\`store_id\`);
CREATE TABLE IF NOT EXISTS \`treasury_accounts\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`user_id\` text,
	\`type\` text NOT NULL,
	\`name\` text NOT NULL,
	\`balance\` text DEFAULT '0' NOT NULL,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`treasury_accounts_store_type_user_idx\` ON \`treasury_accounts\` (\`store_id\`,\`type\`,\`user_id\`);
CREATE INDEX IF NOT EXISTS \`treasury_accounts_store_user_idx\` ON \`treasury_accounts\` (\`store_id\`,\`user_id\`);
CREATE TABLE IF NOT EXISTS \`treasury_transactions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`treasury_account_id\` text NOT NULL,
	\`operational_day_id\` text,
	\`direction\` text NOT NULL,
	\`amount\` text NOT NULL,
	\`balance_after\` text NOT NULL,
	\`reference_type\` text NOT NULL,
	\`reference_id\` text,
	\`description\` text,
	\`created_by\` text,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`treasury_tx_account_idx\` ON \`treasury_transactions\` (\`treasury_account_id\`,\`created_at\`);
CREATE INDEX IF NOT EXISTS \`treasury_tx_store_created_idx\` ON \`treasury_transactions\` (\`store_id\`,\`created_at\`);
CREATE INDEX IF NOT EXISTS \`treasury_tx_reference_idx\` ON \`treasury_transactions\` (\`reference_id\`,\`reference_type\`);
CREATE INDEX IF NOT EXISTS \`treasury_tx_opday_idx\` ON \`treasury_transactions\` (\`operational_day_id\`);
CREATE TABLE IF NOT EXISTS \`operational_days\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`user_id\` text NOT NULL,
	\`status\` text DEFAULT 'OPEN' NOT NULL,
	\`opened_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`closed_at\` integer,
	\`opening_cash_balance\` text DEFAULT '0' NOT NULL,
	\`carry_over_cash\` text DEFAULT '0' NOT NULL,
	\`actual_closing_cash_balance\` text,
	\`expected_closing_cash_balance\` text,
	\`cash_variance\` text,
	\`total_transferred_to_main_safe\` text DEFAULT '0' NOT NULL,
	\`notes\` text,
	\`opened_by\` text NOT NULL,
	\`closed_by\` text,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`op_days_store_user_idx\` ON \`operational_days\` (\`store_id\`,\`user_id\`);
CREATE INDEX IF NOT EXISTS \`op_days_store_status_idx\` ON \`operational_days\` (\`store_id\`,\`status\`);
CREATE INDEX IF NOT EXISTS \`op_days_store_created_idx\` ON \`operational_days\` (\`store_id\`,\`created_at\`);
CREATE TABLE IF NOT EXISTS \`cashier_balance_snapshots\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`operational_day_id\` text NOT NULL,
	\`treasury_account_id\` text NOT NULL,
	\`snapshot_type\` text NOT NULL,
	\`balance\` text DEFAULT '0' NOT NULL,
	\`total_in\` text DEFAULT '0' NOT NULL,
	\`total_out\` text DEFAULT '0' NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`balance_snapshots_opday_idx\` ON \`cashier_balance_snapshots\` (\`operational_day_id\`);
CREATE INDEX IF NOT EXISTS \`balance_snapshots_account_idx\` ON \`cashier_balance_snapshots\` (\`treasury_account_id\`);
CREATE TABLE IF NOT EXISTS \`accounting_accounts\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`code\` text NOT NULL,
	\`name\` text NOT NULL,
	\`name_en\` text,
	\`type\` text NOT NULL,
	\`normal_balance\` text NOT NULL,
	\`is_contra\` integer DEFAULT false NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`accounting_accounts_store_code_unique\` ON \`accounting_accounts\` (\`store_id\`,\`code\`);
CREATE TABLE IF NOT EXISTS \`accounting_transactions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`entry_date\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`description\` text,
	\`reference_type\` text,
	\`reference_id\` text,
	\`created_by\` text,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`accounting_tx_store_date_idx\` ON \`accounting_transactions\` (\`store_id\`,\`entry_date\`);
CREATE INDEX IF NOT EXISTS \`accounting_tx_reference_idx\` ON \`accounting_transactions\` (\`reference_id\`,\`reference_type\`);
CREATE TABLE IF NOT EXISTS \`accounting_transaction_lines\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`transaction_id\` text NOT NULL,
	\`account_id\` text NOT NULL,
	\`debit\` text DEFAULT '0' NOT NULL,
	\`credit\` text DEFAULT '0' NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`accounting_lines_tx_idx\` ON \`accounting_transaction_lines\` (\`transaction_id\`);
CREATE INDEX IF NOT EXISTS \`accounting_lines_account_idx\` ON \`accounting_transaction_lines\` (\`account_id\`);
CREATE TABLE IF NOT EXISTS \`invoices\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`invoice_number\` text NOT NULL,
	\`invoice_barcode\` text NOT NULL,
	\`customer_id\` text,
	\`warehouse_id\` text NOT NULL,
	\`sale_type\` text DEFAULT 'CASH' NOT NULL,
	\`subtotal\` text DEFAULT '0' NOT NULL,
	\`discount_amount\` text DEFAULT '0' NOT NULL,
	\`tax_amount\` text DEFAULT '0' NOT NULL,
	\`total_amount\` text DEFAULT '0' NOT NULL,
	\`total_cost\` text DEFAULT '0' NOT NULL,
	\`amount_paid\` text DEFAULT '0' NOT NULL,
	\`change_due\` text DEFAULT '0' NOT NULL,
	\`payment_status\` text DEFAULT 'PAID' NOT NULL,
	\`return_status\` text DEFAULT 'NONE' NOT NULL,
	\`notes\` text,
	\`created_by\` text NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`invoices_store_number_unique\` ON \`invoices\` (\`store_id\`,\`invoice_number\`);
CREATE UNIQUE INDEX IF NOT EXISTS \`invoices_store_barcode_unique\` ON \`invoices\` (\`store_id\`,\`invoice_barcode\`);
CREATE INDEX IF NOT EXISTS \`invoices_store_created_idx\` ON \`invoices\` (\`store_id\`,\`created_at\`);
CREATE INDEX IF NOT EXISTS \`invoices_store_customer_idx\` ON \`invoices\` (\`store_id\`,\`customer_id\`);
CREATE INDEX IF NOT EXISTS \`invoices_created_by_idx\` ON \`invoices\` (\`created_by\`);
CREATE TABLE IF NOT EXISTS \`invoice_items\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`invoice_id\` text NOT NULL,
	\`variant_id\` text NOT NULL,
	\`quantity\` integer NOT NULL,
	\`unit_price\` text NOT NULL,
	\`unit_cost\` text DEFAULT '0' NOT NULL,
	\`discount_amount\` text DEFAULT '0' NOT NULL,
	\`line_total\` text NOT NULL,
	\`returned_quantity\` integer DEFAULT 0 NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`invoice_items_invoice_idx\` ON \`invoice_items\` (\`invoice_id\`);
CREATE INDEX IF NOT EXISTS \`invoice_items_variant_idx\` ON \`invoice_items\` (\`variant_id\`);
CREATE TABLE IF NOT EXISTS \`invoice_payments\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`invoice_id\` text NOT NULL,
	\`method\` text NOT NULL,
	\`treasury_account_id\` text,
	\`amount\` text NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`invoice_payments_invoice_idx\` ON \`invoice_payments\` (\`invoice_id\`);
CREATE TABLE IF NOT EXISTS \`sales_returns\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`return_number\` text NOT NULL,
	\`invoice_id\` text NOT NULL,
	\`warehouse_id\` text NOT NULL,
	\`total_amount\` text DEFAULT '0' NOT NULL,
	\`total_cost\` text DEFAULT '0' NOT NULL,
	\`refund_method\` text DEFAULT 'CASH' NOT NULL,
	\`treasury_account_id\` text,
	\`reason\` text,
	\`created_by\` text NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`sales_returns_store_number_unique\` ON \`sales_returns\` (\`store_id\`,\`return_number\`);
CREATE INDEX IF NOT EXISTS \`sales_returns_invoice_idx\` ON \`sales_returns\` (\`invoice_id\`);
CREATE INDEX IF NOT EXISTS \`sales_returns_store_created_idx\` ON \`sales_returns\` (\`store_id\`,\`created_at\`);
CREATE TABLE IF NOT EXISTS \`sales_return_items\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`return_id\` text NOT NULL,
	\`invoice_item_id\` text NOT NULL,
	\`variant_id\` text NOT NULL,
	\`quantity\` integer NOT NULL,
	\`unit_price\` text NOT NULL,
	\`unit_cost\` text DEFAULT '0' NOT NULL,
	\`line_total\` text NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`sales_return_items_return_idx\` ON \`sales_return_items\` (\`return_id\`);
CREATE TABLE IF NOT EXISTS \`suspended_orders\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`label\` text,
	\`customer_id\` text,
	\`cart\` text NOT NULL,
	\`item_count\` integer DEFAULT 0 NOT NULL,
	\`total_amount\` text DEFAULT '0' NOT NULL,
	\`created_by\` text NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`suspended_orders_store_idx\` ON \`suspended_orders\` (\`store_id\`,\`created_at\`);
CREATE TABLE IF NOT EXISTS \`purchase_invoices\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`invoice_number\` text NOT NULL,
	\`supplier_invoice_number\` text,
	\`supplier_id\` text NOT NULL,
	\`warehouse_id\` text NOT NULL,
	\`invoice_date\` text,
	\`due_date\` text,
	\`subtotal\` text DEFAULT '0' NOT NULL,
	\`tax_amount\` text DEFAULT '0' NOT NULL,
	\`total_amount\` text DEFAULT '0' NOT NULL,
	\`amount_paid\` text DEFAULT '0' NOT NULL,
	\`remaining_balance\` text DEFAULT '0' NOT NULL,
	\`status\` text DEFAULT 'CONFIRMED' NOT NULL,
	\`return_status\` text DEFAULT 'NONE' NOT NULL,
	\`notes\` text,
	\`created_by\` text NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`purchase_invoices_store_number_unique\` ON \`purchase_invoices\` (\`store_id\`,\`invoice_number\`);
CREATE INDEX IF NOT EXISTS \`purchase_invoices_store_created_idx\` ON \`purchase_invoices\` (\`store_id\`,\`created_at\`);
CREATE INDEX IF NOT EXISTS \`purchase_invoices_supplier_idx\` ON \`purchase_invoices\` (\`supplier_id\`);
CREATE TABLE IF NOT EXISTS \`purchase_invoice_items\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`purchase_id\` text NOT NULL,
	\`variant_id\` text NOT NULL,
	\`quantity\` integer NOT NULL,
	\`cost_price\` text NOT NULL,
	\`line_total\` text NOT NULL,
	\`returned_quantity\` integer DEFAULT 0 NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`purchase_items_purchase_idx\` ON \`purchase_invoice_items\` (\`purchase_id\`);
CREATE INDEX IF NOT EXISTS \`purchase_items_variant_idx\` ON \`purchase_invoice_items\` (\`variant_id\`);
CREATE TABLE IF NOT EXISTS \`purchase_payments\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`purchase_id\` text NOT NULL,
	\`method\` text NOT NULL,
	\`treasury_account_id\` text,
	\`amount\` text NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`purchase_payments_purchase_idx\` ON \`purchase_payments\` (\`purchase_id\`);
CREATE TABLE IF NOT EXISTS \`purchase_returns\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`return_number\` text NOT NULL,
	\`purchase_id\` text NOT NULL,
	\`warehouse_id\` text NOT NULL,
	\`total_amount\` text DEFAULT '0' NOT NULL,
	\`reason\` text,
	\`created_by\` text NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`purchase_returns_store_number_unique\` ON \`purchase_returns\` (\`store_id\`,\`return_number\`);
CREATE INDEX IF NOT EXISTS \`purchase_returns_purchase_idx\` ON \`purchase_returns\` (\`purchase_id\`);
CREATE TABLE IF NOT EXISTS \`purchase_return_items\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`return_id\` text NOT NULL,
	\`purchase_item_id\` text NOT NULL,
	\`variant_id\` text NOT NULL,
	\`quantity\` integer NOT NULL,
	\`cost_price\` text NOT NULL,
	\`line_total\` text NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`purchase_return_items_return_idx\` ON \`purchase_return_items\` (\`return_id\`);
CREATE TABLE IF NOT EXISTS \`employees\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`user_id\` text,
	\`name\` text NOT NULL,
	\`phone\` text,
	\`job_title\` text,
	\`monthly_salary\` text DEFAULT '0' NOT NULL,
	\`advance_balance\` text DEFAULT '0' NOT NULL,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`employees_store_idx\` ON \`employees\` (\`store_id\`);
CREATE TABLE IF NOT EXISTS \`employee_advances\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`employee_id\` text NOT NULL,
	\`amount\` text NOT NULL,
	\`advance_date\` text NOT NULL,
	\`notes\` text,
	\`treasury_account_id\` text NOT NULL,
	\`created_by\` text,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`employee_advances_employee_idx\` ON \`employee_advances\` (\`employee_id\`);
CREATE TABLE IF NOT EXISTS \`equity_movements\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`type\` text NOT NULL,
	\`amount\` text NOT NULL,
	\`movement_date\` text NOT NULL,
	\`description\` text,
	\`treasury_account_id\` text NOT NULL,
	\`created_by\` text,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`equity_movements_store_idx\` ON \`equity_movements\` (\`store_id\`,\`movement_date\`);
CREATE TABLE IF NOT EXISTS \`expense_categories\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`name\` text NOT NULL,
	\`is_active\` integer DEFAULT true NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`expense_categories_store_name_unique\` ON \`expense_categories\` (\`store_id\`,\`name\`);
CREATE TABLE IF NOT EXISTS \`expenses\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`category_id\` text NOT NULL,
	\`amount\` text NOT NULL,
	\`expense_date\` text NOT NULL,
	\`description\` text,
	\`treasury_account_id\` text NOT NULL,
	\`recorded_by\` text NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`expenses_store_date_idx\` ON \`expenses\` (\`store_id\`,\`expense_date\`);
CREATE INDEX IF NOT EXISTS \`expenses_category_idx\` ON \`expenses\` (\`category_id\`);
CREATE TABLE IF NOT EXISTS \`salary_records\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`employee_id\` text NOT NULL,
	\`period_month\` text NOT NULL,
	\`base_salary\` text DEFAULT '0' NOT NULL,
	\`deductions\` text DEFAULT '0' NOT NULL,
	\`bonuses\` text DEFAULT '0' NOT NULL,
	\`net_amount\` text DEFAULT '0' NOT NULL,
	\`status\` text DEFAULT 'PENDING' NOT NULL,
	\`treasury_account_id\` text,
	\`paid_at\` integer,
	\`created_by\` text,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`salary_records_employee_period_unique\` ON \`salary_records\` (\`employee_id\`,\`period_month\`);
CREATE INDEX IF NOT EXISTS \`salary_records_store_idx\` ON \`salary_records\` (\`store_id\`);
CREATE TABLE IF NOT EXISTS \`stock_counts\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`count_number\` text NOT NULL,
	\`warehouse_id\` text NOT NULL,
	\`status\` text DEFAULT 'OPEN' NOT NULL,
	\`notes\` text,
	\`created_by\` text NOT NULL,
	\`approved_by\` text,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`completed_at\` integer
);
CREATE UNIQUE INDEX IF NOT EXISTS \`stock_counts_store_number_unique\` ON \`stock_counts\` (\`store_id\`,\`count_number\`);
CREATE INDEX IF NOT EXISTS \`stock_counts_store_idx\` ON \`stock_counts\` (\`store_id\`,\`created_at\`);
CREATE TABLE IF NOT EXISTS \`stock_count_items\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`count_id\` text NOT NULL,
	\`variant_id\` text NOT NULL,
	\`expected_quantity\` integer NOT NULL,
	\`counted_quantity\` integer,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`stock_count_items_count_idx\` ON \`stock_count_items\` (\`count_id\`);
CREATE TABLE IF NOT EXISTS \`warehouse_transfers\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`transfer_number\` text NOT NULL,
	\`from_warehouse_id\` text NOT NULL,
	\`to_warehouse_id\` text NOT NULL,
	\`status\` text DEFAULT 'PENDING' NOT NULL,
	\`notes\` text,
	\`created_by\` text NOT NULL,
	\`confirmed_by\` text,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`confirmed_at\` integer
);
CREATE UNIQUE INDEX IF NOT EXISTS \`warehouse_transfers_store_number_unique\` ON \`warehouse_transfers\` (\`store_id\`,\`transfer_number\`);
CREATE INDEX IF NOT EXISTS \`warehouse_transfers_store_idx\` ON \`warehouse_transfers\` (\`store_id\`,\`created_at\`);
CREATE TABLE IF NOT EXISTS \`warehouse_transfer_items\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`transfer_id\` text NOT NULL,
	\`variant_id\` text NOT NULL,
	\`quantity\` integer NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS \`warehouse_transfer_items_transfer_idx\` ON \`warehouse_transfer_items\` (\`transfer_id\`);
CREATE TABLE IF NOT EXISTS \`notifications\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`user_id\` text NOT NULL,
	\`type\` text NOT NULL,
	\`severity\` text DEFAULT 'INFO' NOT NULL,
	\`title\` text NOT NULL,
	\`body\` text,
	\`reference_type\` text,
	\`reference_id\` text,
	\`dedupe_key\` text,
	\`is_read\` integer DEFAULT false NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`read_at\` integer
);
CREATE INDEX IF NOT EXISTS \`notifications_user_read_idx\` ON \`notifications\` (\`user_id\`,\`is_read\`,\`created_at\`);
CREATE INDEX IF NOT EXISTS \`notifications_store_idx\` ON \`notifications\` (\`store_id\`);
CREATE TABLE IF NOT EXISTS \`number_sequences\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`kind\` text NOT NULL,
	\`prefix\` text DEFAULT '' NOT NULL,
	\`padding\` integer DEFAULT 5 NOT NULL,
	\`next_value\` integer DEFAULT 1 NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`number_sequences_store_kind_unique\` ON \`number_sequences\` (\`store_id\`,\`kind\`);
CREATE TABLE IF NOT EXISTS \`store_settings\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`store_id\` text NOT NULL,
	\`currency\` text DEFAULT 'EGP' NOT NULL,
	\`tax_enabled\` integer DEFAULT false NOT NULL,
	\`tax_rate\` text DEFAULT '0' NOT NULL,
	\`tax_inclusive\` integer DEFAULT false NOT NULL,
	\`receipt_size\` text DEFAULT '80mm' NOT NULL,
	\`receipt_footer\` text,
	\`numeral_format\` text DEFAULT 'western' NOT NULL,
	\`allow_negative_stock\` integer DEFAULT false NOT NULL,
	\`allow_below_cost_discount\` integer DEFAULT false NOT NULL,
	\`allow_negative_treasury\` integer DEFAULT false NOT NULL,
	\`require_session_for_cash\` integer DEFAULT true NOT NULL,
	\`shift_start_hour\` integer DEFAULT 11 NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`store_settings_store_unique\` ON \`store_settings\` (\`store_id\`);
`;

export async function ensureDbSchema(client: any): Promise<void> {
  const statements = FULL_SCHEMA_SQL.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      await client.execute(stmt);
    } catch (_err) {
      // Ignore if exists or already created
    }
  }
}
