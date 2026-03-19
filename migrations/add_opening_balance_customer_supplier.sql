-- Add opening_balance and opening_balance_date to customer and supplier tables
-- Run this migration once. If columns already exist, the statements will fail (safe to ignore).
-- Compatible with MySQL 5.7+

-- Disable safe update mode for this migration (required for UPDATE without key in WHERE)
SET SQL_SAFE_UPDATES = 0;

-- Customer table
ALTER TABLE `customer` ADD COLUMN `opening_balance` DOUBLE NOT NULL DEFAULT 0;
ALTER TABLE `customer` ADD COLUMN `opening_balance_date` DATETIME(3) NULL;
UPDATE `customer` SET `opening_balance_date` = NOW() WHERE `opening_balance_date` IS NULL;
ALTER TABLE `customer` MODIFY COLUMN `opening_balance_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- Supplier table
ALTER TABLE `supplier` ADD COLUMN `opening_balance` DOUBLE NOT NULL DEFAULT 0;
ALTER TABLE `supplier` ADD COLUMN `opening_balance_date` DATETIME(3) NULL;
UPDATE `supplier` SET `opening_balance_date` = NOW() WHERE `opening_balance_date` IS NULL;
ALTER TABLE `supplier` MODIFY COLUMN `opening_balance_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- Re-enable safe update mode
SET SQL_SAFE_UPDATES = 1;
