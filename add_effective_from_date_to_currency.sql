-- Add effective_from_date column to product_currency table
-- This allows currencies to have an effective date for their conversion rates

ALTER TABLE `product_currency` 
ADD COLUMN `effective_from_date` DATETIME(3) NULL 
AFTER `conversion`;

-- Optional: Add a comment to document the column
ALTER TABLE `product_currency` 
MODIFY COLUMN `effective_from_date` DATETIME(3) NULL 
COMMENT 'Date from which this currency conversion rate is effective. If NULL, the rate is always effective.';

