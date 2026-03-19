-- Make customer phone and address optional (allow NULL)
-- Run this migration once. If columns are already nullable, the statements may fail (safe to ignore).
-- Compatible with MySQL 5.7+

-- Customer table: allow NULL for phone and address
ALTER TABLE `customer` MODIFY COLUMN `phone` VARCHAR(191) NULL;
ALTER TABLE `customer` MODIFY COLUMN `address` VARCHAR(191) NULL;
