-- Migration: Update discount_master table structure
-- This script updates the discount_master table to support Publisher + Customer/Supplier combinations

-- Step 1: Drop the old discount_master table if it exists (backup your data first!)
-- WARNING: This will delete all existing discount master data
-- DROP TABLE IF EXISTS `discount_master`;

-- Step 2: Create the updated discount_master table
CREATE TABLE IF NOT EXISTS `discount_master` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `discount_type` VARCHAR(191) NOT NULL,
  `publisher_id` INTEGER NOT NULL,
  `customer_id` INTEGER NULL,
  `supplier_id` INTEGER NULL,
  `discount_value` DOUBLE NOT NULL,
  `discount_unit` VARCHAR(191) NOT NULL,
  `status` BOOLEAN NOT NULL DEFAULT true,
  `effective_from` DATETIME(3) NULL,
  `effective_to` DATETIME(3) NULL,
  `description` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `discount_master_company_id_idx`(`company_id`),
  INDEX `discount_master_discount_type_idx`(`discount_type`),
  INDEX `discount_master_publisher_id_idx`(`publisher_id`),
  INDEX `discount_master_customer_id_idx`(`customer_id`),
  INDEX `discount_master_supplier_id_idx`(`supplier_id`),
  INDEX `discount_master_status_idx`(`status`),
  INDEX `discount_master_effective_from_idx`(`effective_from`),
  INDEX `discount_master_effective_to_idx`(`effective_to`),
  CONSTRAINT `discount_master_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `appSetting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `discount_master_publisher_id_fkey` FOREIGN KEY (`publisher_id`) REFERENCES `book_publisher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `discount_master_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `discount_master_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Note: 
-- - discount_type can be: "sale" or "purchase"
-- - For "sale": publisher_id and customer_id are required
-- - For "purchase": publisher_id and supplier_id are required
-- - discount_unit can be: "percentage" or "fixed"
-- - effective_from and effective_to are optional date ranges for when the discount is active
