-- Create product_currency_rate table for maintaining currency conversion rate history
-- This table stores historical conversion rates with effective dates

CREATE TABLE IF NOT EXISTS `product_currency_rate` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `product_currency_id` INTEGER NOT NULL,
  `conversion` DOUBLE NOT NULL,
  `effective_from_date` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  
  PRIMARY KEY (`id`),
  INDEX `product_currency_rate_product_currency_id_idx` (`product_currency_id`),
  INDEX `product_currency_rate_effective_from_date_idx` (`effective_from_date`),
  
  CONSTRAINT `product_currency_rate_product_currency_id_fkey` 
    FOREIGN KEY (`product_currency_id`) 
    REFERENCES `product_currency` (`id`) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Optional: Migrate existing conversion rates to the new table
-- This will create a rate entry for each existing currency
INSERT INTO `product_currency_rate` (`product_currency_id`, `conversion`, `effective_from_date`, `createdAt`, `updatedAt`)
SELECT 
  `id`,
  `conversion`,
  COALESCE(`effective_from_date`, `createdAt`) as `effective_from_date`,
  `createdAt`,
  `updatedAt`
FROM `product_currency`
WHERE NOT EXISTS (
  SELECT 1 FROM `product_currency_rate` 
  WHERE `product_currency_rate`.`product_currency_id` = `product_currency`.`id`
);

