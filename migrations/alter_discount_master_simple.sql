-- Migration: Alter existing discount_master table to new structure
-- Run this script step by step, checking for errors

-- STEP 1: Check if table exists and has data
SELECT COUNT(*) as total_records FROM `discount_master`;

-- STEP 2: If you have data, delete it (old structure is incompatible with new structure)
-- Uncomment the next line if you want to start fresh:
-- DELETE FROM `discount_master`;

-- STEP 3: Find and drop foreign key constraint on reference_id (if exists)
-- Run this to find the constraint name:
SELECT 
  CONSTRAINT_NAME,
  TABLE_NAME,
  COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'discount_master' 
  AND COLUMN_NAME = 'reference_id'
  AND CONSTRAINT_NAME != 'PRIMARY';

-- Then drop it (replace 'YOUR_CONSTRAINT_NAME' with the actual name from above):
-- ALTER TABLE `discount_master` DROP FOREIGN KEY `YOUR_CONSTRAINT_NAME`;

-- STEP 4: Drop index on reference_id
ALTER TABLE `discount_master` DROP INDEX IF EXISTS `discount_master_reference_id_idx`;

-- STEP 5: Add new columns
ALTER TABLE `discount_master`
  ADD COLUMN `publisher_id` INTEGER NULL AFTER `discount_type`,
  ADD COLUMN `customer_id` INTEGER NULL AFTER `publisher_id`,
  ADD COLUMN `supplier_id` INTEGER NULL AFTER `customer_id`;

-- STEP 6: Add indexes
ALTER TABLE `discount_master`
  ADD INDEX `discount_master_publisher_id_idx`(`publisher_id`),
  ADD INDEX `discount_master_customer_id_idx`(`customer_id`),
  ADD INDEX `discount_master_supplier_id_idx`(`supplier_id`);

-- STEP 7: Add foreign keys
ALTER TABLE `discount_master`
  ADD CONSTRAINT `discount_master_publisher_id_fkey` 
    FOREIGN KEY (`publisher_id`) REFERENCES `book_publisher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `discount_master`
  ADD CONSTRAINT `discount_master_customer_id_fkey` 
    FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `discount_master`
  ADD CONSTRAINT `discount_master_supplier_id_fkey` 
    FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- STEP 8: Remove old reference_id column
ALTER TABLE `discount_master` DROP COLUMN `reference_id`;

-- STEP 9: Make publisher_id NOT NULL (only if table is empty or all rows have values)
ALTER TABLE `discount_master` MODIFY COLUMN `publisher_id` INTEGER NOT NULL;

-- STEP 10: Verify
DESCRIBE `discount_master`;
