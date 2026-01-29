-- Migration Script: Add Super Admin Support
-- This script adds super admin functionality to the ERP system

-- ============================================================================
-- STEP 1: Add is_super_admin field to user table
-- ============================================================================
ALTER TABLE `user` 
ADD COLUMN `is_super_admin` BOOLEAN NOT NULL DEFAULT FALSE 
AFTER `status`;

-- ============================================================================
-- STEP 2: Add status field to appSetting (company) table
-- ============================================================================
ALTER TABLE `appSetting` 
ADD COLUMN `status` BOOLEAN NOT NULL DEFAULT TRUE 
AFTER `challan_terms`;

-- ============================================================================
-- STEP 3: Create a super admin user (optional - adjust credentials as needed)
-- ============================================================================
-- Note: Replace 'superadmin' and 'your_password_hash' with actual values
-- Password should be hashed using bcrypt with saltRounds=10
-- Example: Use Node.js bcrypt.hash('your_password', 10) to generate hash

-- INSERT INTO `user` (
--   `username`, 
--   `password`, 
--   `role`, 
--   `email`, 
--   `status`, 
--   `is_super_admin`,
--   `createdAt`,
--   `updatedAt`
-- ) VALUES (
--   'superadmin',
--   '$2b$10$YOUR_PASSWORD_HASH_HERE', -- Replace with actual bcrypt hash
--   'superAdmin',
--   'admin@erpbooks.com',
--   TRUE,
--   TRUE,
--   NOW(),
--   NOW()
-- );

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Check if is_super_admin column exists
-- SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT 
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_SCHEMA = DATABASE() 
-- AND TABLE_NAME = 'user' 
-- AND COLUMN_NAME = 'is_super_admin';

-- Check if status column exists in appSetting
-- SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT 
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_SCHEMA = DATABASE() 
-- AND TABLE_NAME = 'appSetting' 
-- AND COLUMN_NAME = 'status';

-- List all super admin users
-- SELECT id, username, email, status, is_super_admin 
-- FROM `user` 
-- WHERE is_super_admin = TRUE;
