-- Add list_price and location_id to product_stock table
-- Run this migration once. If columns already exist, the statements will fail (safe to ignore).
-- Compatible with MySQL 5.7+

ALTER TABLE `product_stock` ADD COLUMN `list_price` DOUBLE NULL;
ALTER TABLE `product_stock` ADD COLUMN `location_id` INT NULL;
ALTER TABLE `product_stock` ADD CONSTRAINT `product_stock_location_id_fkey` 
  FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX `product_stock_location_id_idx` ON `product_stock`(`location_id`);
