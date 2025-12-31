-- ========================================
-- DATABASE MIGRATION QUERIES
-- ========================================
-- Date: 2025-01-XX
-- Purpose: Add payment_method and reference_number fields to transaction table
-- ========================================

-- IMPORTANT: Backup your database before running these queries!

-- ========================================
-- ALTER transaction TABLE
-- ========================================
-- Add fields for tracking payment method and reference number

ALTER TABLE `transaction` 
ADD COLUMN `payment_method` VARCHAR(191) NULL DEFAULT NULL AFTER `related_id`,
ADD COLUMN `reference_number` VARCHAR(191) NULL DEFAULT NULL AFTER `payment_method`;

-- ========================================
-- VERIFICATION QUERIES
-- ========================================
-- Run these to verify the changes were applied successfully

-- Check transaction table structure
DESCRIBE `transaction`;

-- Verify the new columns exist
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'transaction'
AND COLUMN_NAME IN ('payment_method', 'reference_number');

