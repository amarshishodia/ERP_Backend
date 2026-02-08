-- Migration: Add Order Management System
-- This migration adds sales_order, purchase_order tables and updates existing tables

-- 1. Create sales_order table
CREATE TABLE IF NOT EXISTS `sales_order` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_number` VARCHAR(191) NOT NULL,
  `order_date` DATETIME(3) NOT NULL,
  `customer_id` INT NOT NULL,
  `company_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `total_amount` DOUBLE NOT NULL,
  `discount` DOUBLE NOT NULL DEFAULT 0,
  `note` TEXT,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sales_order_order_number_key` (`order_number`),
  KEY `sales_order_customer_id_idx` (`customer_id`),
  KEY `sales_order_company_id_idx` (`company_id`),
  KEY `sales_order_user_id_idx` (`user_id`),
  KEY `sales_order_order_number_idx` (`order_number`),
  KEY `sales_order_status_idx` (`status`),
  KEY `sales_order_order_date_idx` (`order_date`),
  CONSTRAINT `sales_order_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customer` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `sales_order_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `appSetting` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `sales_order_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Create sales_order_item table
CREATE TABLE IF NOT EXISTS `sales_order_item` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `ordered_quantity` INT NOT NULL,
  `fulfilled_quantity` INT NOT NULL DEFAULT 0,
  `sale_price` DOUBLE NOT NULL,
  `discount` DOUBLE NOT NULL DEFAULT 0,
  `total_amount` DOUBLE NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sales_order_item_order_id_idx` (`order_id`),
  KEY `sales_order_item_product_id_idx` (`product_id`),
  CONSTRAINT `sales_order_item_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `sales_order` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `sales_order_item_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `product` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create purchase_order table
CREATE TABLE IF NOT EXISTS `purchase_order` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_number` VARCHAR(191) NOT NULL,
  `order_date` DATETIME(3) NOT NULL,
  `supplier_id` INT NOT NULL,
  `company_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `sales_order_id` INT,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `total_amount` DOUBLE NOT NULL,
  `discount` DOUBLE NOT NULL DEFAULT 0,
  `expected_delivery_date` DATETIME(3),
  `note` TEXT,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `purchase_order_order_number_key` (`order_number`),
  KEY `purchase_order_supplier_id_idx` (`supplier_id`),
  KEY `purchase_order_company_id_idx` (`company_id`),
  KEY `purchase_order_user_id_idx` (`user_id`),
  KEY `purchase_order_sales_order_id_idx` (`sales_order_id`),
  KEY `purchase_order_order_number_idx` (`order_number`),
  KEY `purchase_order_status_idx` (`status`),
  KEY `purchase_order_order_date_idx` (`order_date`),
  CONSTRAINT `purchase_order_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `supplier` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `purchase_order_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `appSetting` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `purchase_order_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT `purchase_order_sales_order_id_fkey` FOREIGN KEY (`sales_order_id`) REFERENCES `sales_order` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Create purchase_order_item table
CREATE TABLE IF NOT EXISTS `purchase_order_item` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `ordered_quantity` INT NOT NULL,
  `received_quantity` INT NOT NULL DEFAULT 0,
  `purchase_price` DOUBLE NOT NULL,
  `discount` DOUBLE NOT NULL DEFAULT 0,
  `total_amount` DOUBLE NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `purchase_order_item_order_id_idx` (`order_id`),
  KEY `purchase_order_item_product_id_idx` (`product_id`),
  CONSTRAINT `purchase_order_item_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `purchase_order` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `purchase_order_item_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `product` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Add sales_order_id and purchase_order_id to purchaseInvoice table
ALTER TABLE `purchaseInvoice` 
  ADD COLUMN `sales_order_id` INT NULL AFTER `company_id`,
  ADD COLUMN `purchase_order_id` INT NULL AFTER `sales_order_id`;

-- 6. Add indexes for the new foreign keys in purchaseInvoice
ALTER TABLE `purchaseInvoice`
  ADD KEY `purchaseInvoice_sales_order_id_idx` (`sales_order_id`),
  ADD KEY `purchaseInvoice_purchase_order_id_idx` (`purchase_order_id`);

-- 7. Add foreign key constraints for purchaseInvoice
ALTER TABLE `purchaseInvoice`
  ADD CONSTRAINT `purchaseInvoice_sales_order_id_fkey` FOREIGN KEY (`sales_order_id`) REFERENCES `sales_order` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `purchaseInvoice_purchase_order_id_fkey` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 8. Add sales_order_id to saleInvoice table
ALTER TABLE `saleInvoice` 
  ADD COLUMN `sales_order_id` INT NULL AFTER `company_id`;

-- 9. Add index for the new foreign key in saleInvoice
ALTER TABLE `saleInvoice`
  ADD KEY `saleInvoice_sales_order_id_idx` (`sales_order_id`);

-- 10. Add foreign key constraint for saleInvoice
ALTER TABLE `saleInvoice`
  ADD CONSTRAINT `saleInvoice_sales_order_id_fkey` FOREIGN KEY (`sales_order_id`) REFERENCES `sales_order` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
