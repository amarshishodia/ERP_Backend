-- Migration: Create E-commerce Tables
-- This migration creates tables for e-commerce functionality: wishlist, cart, and orders

-- Create ecommerce_wishlist table
CREATE TABLE IF NOT EXISTS `ecommerce_wishlist` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `product_id` INT NOT NULL,
    `customer_id` INT NULL,
    `session_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `ecommerce_wishlist_product_id_customer_id_key` (`product_id`, `customer_id`),
    UNIQUE KEY `ecommerce_wishlist_product_id_session_id_key` (`product_id`, `session_id`),
    KEY `ecommerce_wishlist_product_id_idx` (`product_id`),
    KEY `ecommerce_wishlist_customer_id_idx` (`customer_id`),
    KEY `ecommerce_wishlist_session_id_idx` (`session_id`),
    CONSTRAINT `ecommerce_wishlist_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE CASCADE,
    CONSTRAINT `ecommerce_wishlist_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create ecommerce_cart table
CREATE TABLE IF NOT EXISTS `ecommerce_cart` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `product_id` INT NOT NULL,
    `quantity` INT NOT NULL DEFAULT 1,
    `customer_id` INT NULL,
    `session_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `ecommerce_cart_product_id_customer_id_key` (`product_id`, `customer_id`),
    UNIQUE KEY `ecommerce_cart_product_id_session_id_key` (`product_id`, `session_id`),
    KEY `ecommerce_cart_product_id_idx` (`product_id`),
    KEY `ecommerce_cart_customer_id_idx` (`customer_id`),
    KEY `ecommerce_cart_session_id_idx` (`session_id`),
    CONSTRAINT `ecommerce_cart_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE CASCADE,
    CONSTRAINT `ecommerce_cart_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create ecommerce_order table
CREATE TABLE IF NOT EXISTS `ecommerce_order` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `order_number` VARCHAR(191) NOT NULL UNIQUE,
    `customer_id` INT NULL,
    `customer_name` VARCHAR(191) NOT NULL,
    `customer_phone` VARCHAR(191) NOT NULL,
    `customer_email` VARCHAR(191) NULL,
    `customer_address` VARCHAR(191) NOT NULL,
    `company_id` INT NULL,
    `total_amount` DOUBLE NOT NULL,
    `discount` DOUBLE NOT NULL DEFAULT 0,
    `paid_amount` DOUBLE NOT NULL DEFAULT 0,
    `due_amount` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `payment_status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `payment_method` VARCHAR(191) NULL,
    `shipping_address` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `session_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    KEY `ecommerce_order_customer_id_idx` (`customer_id`),
    KEY `ecommerce_order_company_id_idx` (`company_id`),
    KEY `ecommerce_order_order_number_idx` (`order_number`),
    KEY `ecommerce_order_status_idx` (`status`),
    KEY `ecommerce_order_session_id_idx` (`session_id`),
    CONSTRAINT `ecommerce_order_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON DELETE SET NULL,
    CONSTRAINT `ecommerce_order_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `appSetting`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create ecommerce_order_item table
CREATE TABLE IF NOT EXISTS `ecommerce_order_item` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `order_id` INT NOT NULL,
    `product_id` INT NOT NULL,
    `quantity` INT NOT NULL,
    `sale_price` DOUBLE NOT NULL,
    `discount` DOUBLE NOT NULL DEFAULT 0,
    `total_amount` DOUBLE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    KEY `ecommerce_order_item_order_id_idx` (`order_id`),
    KEY `ecommerce_order_item_product_id_idx` (`product_id`),
    CONSTRAINT `ecommerce_order_item_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `ecommerce_order`(`id`) ON DELETE CASCADE,
    CONSTRAINT `ecommerce_order_item_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
