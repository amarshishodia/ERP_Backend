-- Migration: Add support for multiple categories per product
-- This script creates the product_product_category join table and migrates existing data

-- Step 1: Create the product_product_category join table
CREATE TABLE IF NOT EXISTS `product_product_category` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `product_id` INTEGER NOT NULL,
  `product_category_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `product_product_category_product_id_product_category_id_key`(`product_id`, `product_category_id`),
  INDEX `product_product_category_product_id_idx`(`product_id`),
  INDEX `product_product_category_product_category_id_idx`(`product_category_id`),
  CONSTRAINT `product_product_category_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `product_product_category_product_category_id_fkey` FOREIGN KEY (`product_category_id`) REFERENCES `product_category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Step 2: Migrate existing data from product.product_category_id to product_product_category
-- This will create entries in the join table for all existing products that have a category
INSERT INTO `product_product_category` (`product_id`, `product_category_id`, `created_at`)
SELECT 
  `id` AS `product_id`,
  `product_category_id`,
  NOW() AS `created_at`
FROM `product`
WHERE `product_category_id` IS NOT NULL
  AND NOT EXISTS (
    -- Avoid duplicates if migration is run multiple times
    SELECT 1 
    FROM `product_product_category` 
    WHERE `product_product_category`.`product_id` = `product`.`id`
      AND `product_product_category`.`product_category_id` = `product`.`product_category_id`
  );

-- Step 3: Verify the migration
-- You can run this query to check the results:
-- SELECT 
--   p.id AS product_id,
--   p.name AS product_name,
--   p.product_category_id AS old_category_id,
--   COUNT(ppc.product_category_id) AS new_category_count
-- FROM product p
-- LEFT JOIN product_product_category ppc ON p.id = ppc.product_id
-- GROUP BY p.id, p.name, p.product_category_id
-- ORDER BY p.id;

-- Note: The product_category_id column in the product table is kept for backward compatibility
-- You can optionally remove it later if you want, but it's recommended to keep it for now.
