-- Migration: Add discount_master table
-- This script creates the discount_master table for managing discounts by publisher, customer, or supplier

-- Step 1: Create the discount_master table
CREATE TABLE IF NOT EXISTS `discount_master` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `company_id` INTEGER NOT NULL,
  `discount_type` VARCHAR(191) NOT NULL,
  `reference_id` INTEGER NOT NULL,
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
  INDEX `discount_master_reference_id_idx`(`reference_id`),
  INDEX `discount_master_status_idx`(`status`),
  INDEX `discount_master_effective_from_idx`(`effective_from`),
  INDEX `discount_master_effective_to_idx`(`effective_to`),
  CONSTRAINT `discount_master_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `appSetting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Step 2: Verify the migration
-- You can run this query to check the table structure:
-- DESCRIBE `discount_master`;

-- Note: 
-- - discount_type can be: "publisher", "customer", or "supplier"
-- - discount_unit can be: "percentage" or "fixed"
-- - reference_id refers to the ID in book_publisher, customer, or supplier table based on discount_type
-- - effective_from and effective_to are optional date ranges for when the discount is active
