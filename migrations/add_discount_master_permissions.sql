-- Migration: Add discount master permissions
-- Run this SQL script to add the discount master permissions to your database

-- Step 1: Insert discount master permissions into the permission table
INSERT INTO `permission` (`name`, `createdAt`, `updatedAt`)
VALUES 
  ('createDiscountMaster', NOW(), NOW()),
  ('viewDiscountMaster', NOW(), NOW()),
  ('updateDiscountMaster', NOW(), NOW()),
  ('deleteDiscountMaster', NOW(), NOW())
ON DUPLICATE KEY UPDATE `updatedAt` = NOW();

-- Step 2: Assign these permissions to the admin role (role_id = 1)
INSERT INTO `rolePermission` (`role_id`, `permission_id`, `status`, `createdAt`, `updatedAt`)
SELECT 
  1 as role_id,
  p.id as permission_id,
  true as status,
  NOW() as createdAt,
  NOW() as updatedAt
FROM `permission` p
WHERE p.name IN ('createDiscountMaster', 'viewDiscountMaster', 'updateDiscountMaster', 'deleteDiscountMaster')
ON DUPLICATE KEY UPDATE `updatedAt` = NOW();

-- Step 3: Verify permissions were added
-- SELECT * FROM permission WHERE name LIKE '%DiscountMaster%';
