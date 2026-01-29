-- Migration: Alter existing discount_master table to new structure (SAFE VERSION)
-- This script updates the discount_master table from the old structure to the new one
-- OLD: discount_type (publisher/customer/supplier) + reference_id
-- NEW: discount_type (sale/purchase) + publisher_id + customer_id + supplier_id

-- IMPORTANT: Backup your data before running this script!

-- Step 1: Check existing data and structure
-- Run these queries first to see what you have:
-- SELECT COUNT(*) as total_records FROM `discount_master`;
-- DESCRIBE `discount_master`;
-- SHOW CREATE TABLE `discount_master`;

-- Step 2: If you have existing data, delete it (structure is incompatible)
-- The old structure doesn't map directly to the new structure
-- Uncomment the next line if you want to start fresh:
-- DELETE FROM `discount_master`;

-- Step 3: Drop foreign key constraint on reference_id if it exists
-- First, find the constraint name:
-- SELECT CONSTRAINT_NAME 
-- FROM information_schema.KEY_COLUMN_USAGE 
-- WHERE TABLE_NAME = 'discount_master' 
--   AND COLUMN_NAME = 'reference_id' 
--   AND TABLE_SCHEMA = DATABASE();

-- Then drop it (replace CONSTRAINT_NAME with actual name):
-- ALTER TABLE `discount_master` DROP FOREIGN KEY `CONSTRAINT_NAME`;

-- Step 4: Drop index on reference_id if it exists
ALTER TABLE `discount_master`
  DROP INDEX IF EXISTS `discount_master_reference_id_idx`;

-- Step 5: Add new columns
ALTER TABLE `discount_master`
  ADD COLUMN `publisher_id` INTEGER NULL AFTER `discount_type`,
  ADD COLUMN `customer_id` INTEGER NULL AFTER `publisher_id`,
  ADD COLUMN `supplier_id` INTEGER NULL AFTER `customer_id`;

-- Step 6: Add indexes for new columns
ALTER TABLE `discount_master`
  ADD INDEX `discount_master_publisher_id_idx`(`publisher_id`),
  ADD INDEX `discount_master_customer_id_idx`(`customer_id`),
  ADD INDEX `discount_master_supplier_id_idx`(`supplier_id`);

-- Step 7: Add foreign key constraints
ALTER TABLE `discount_master`
  ADD CONSTRAINT `discount_master_publisher_id_fkey` 
    FOREIGN KEY (`publisher_id`) REFERENCES `book_publisher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `discount_master_customer_id_fkey` 
    FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `discount_master_supplier_id_fkey` 
    FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 8: Remove old reference_id column
ALTER TABLE `discount_master`
  DROP COLUMN `reference_id`;

-- Step 9: Make publisher_id NOT NULL (required field)
-- This will only work if the table is empty or all rows have publisher_id set
ALTER TABLE `discount_master`
  MODIFY COLUMN `publisher_id` INTEGER NOT NULL;

-- Step 10: Verify the changes
DESCRIBE `discount_master`;
SHOW INDEX FROM `discount_master`;

-- Note: 
-- - If you had existing data, you'll need to recreate it with the new structure
-- - discount_type values should be "sale" or "purchase" (not "publisher"/"customer"/"supplier")
-- - For "sale": publisher_id and customer_id are required
-- - For "purchase": publisher_id and supplier_id are required
