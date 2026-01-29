-- Rollback script: Remove multiple categories support
-- WARNING: This will delete all multiple category relationships
-- Products will only keep their primary category (product_category_id)

-- Step 1: Delete all entries from product_product_category table
DELETE FROM `product_product_category`;

-- Step 2: Drop the product_product_category table
DROP TABLE IF EXISTS `product_product_category`;

-- Note: The product_category_id column in the product table remains unchanged
-- so products will still have their primary category after rollback.
