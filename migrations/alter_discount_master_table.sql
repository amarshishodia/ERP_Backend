-- Migration: Alter existing discount_master table to new structure
-- This script updates the discount_master table from the old structure to the new one
-- OLD: discount_type (publisher/customer/supplier) + reference_id
-- NEW: discount_type (sale/purchase) + publisher_id + customer_id + supplier_id

-- IMPORTANT: Backup your data before running this script!

-- Step 1: Check if you have existing data
-- SELECT COUNT(*) FROM `discount_master`;
-- If you have data, you'll need to manually migrate it or delete it first
-- The old structure doesn't map directly to the new structure

-- Step 2: Delete existing data (if any) since structure is incompatible
-- Uncomment the next line if you want to start fresh:
-- DELETE FROM `discount_master`;

-- Step 3: Add new columns
ALTER TABLE `discount_master`
  ADD COLUMN `publisher_id` INTEGER NULL AFTER `discount_type`,
  ADD COLUMN `customer_id` INTEGER NULL AFTER `publisher_id`,
  ADD COLUMN `supplier_id` INTEGER NULL AFTER `customer_id`;

-- Step 4: Add foreign key constraints
ALTER TABLE `discount_master`
  ADD CONSTRAINT `discount_master_publisher_id_fkey` 
    FOREIGN KEY (`publisher_id`) REFERENCES `book_publisher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `discount_master_customer_id_fkey` 
    FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `discount_master_supplier_id_fkey` 
    FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 5: Add indexes for new columns
ALTER TABLE `discount_master`
  ADD INDEX `discount_master_publisher_id_idx`(`publisher_id`),
  ADD INDEX `discount_master_customer_id_idx`(`customer_id`),
  ADD INDEX `discount_master_supplier_id_idx`(`supplier_id`);

-- Step 6: Remove old reference_id column
-- First, drop the index if it exists
ALTER TABLE `discount_master`
  DROP INDEX IF EXISTS `discount_master_reference_id_idx`;

-- Drop the foreign key constraint if it exists (check your actual constraint name)
-- You may need to check: SHOW CREATE TABLE `discount_master`; to find the exact constraint name
-- ALTER TABLE `discount_master` DROP FOREIGN KEY `discount_master_reference_id_fkey`;

-- Now drop the column
ALTER TABLE `discount_master`
  DROP COLUMN `reference_id`;

-- Step 7: Make publisher_id NOT NULL (required field)
-- This will fail if you have NULL values, so ensure all rows have publisher_id set first
ALTER TABLE `discount_master`
  MODIFY COLUMN `publisher_id` INTEGER NOT NULL;

-- Step 8: Verify the changes
-- DESCRIBE `discount_master`;
-- SHOW INDEX FROM `discount_master`;

-- Note: The discount_type column values will need to be updated manually:
-- - Old "publisher" type cannot be mapped (new structure requires publisher + customer/supplier)
-- - Old "customer" type should become "sale" type
-- - Old "supplier" type should become "purchase" type
-- Since the structure is fundamentally different, existing data may need to be recreated
