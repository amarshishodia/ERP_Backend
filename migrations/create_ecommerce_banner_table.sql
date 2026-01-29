-- Migration: Create E-commerce Banner Table
-- This migration creates the banner table for e-commerce homepage and category banners

CREATE TABLE IF NOT EXISTS `ecommerce_banner` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `image_url` VARCHAR(191) NOT NULL,
    `link_url` VARCHAR(191) NULL,
    `position` VARCHAR(191) NOT NULL DEFAULT 'homepage',
    `order` INT NOT NULL DEFAULT 0,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `start_date` DATETIME(3) NULL,
    `end_date` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    KEY `ecommerce_banner_status_idx` (`status`),
    KEY `ecommerce_banner_position_idx` (`position`),
    KEY `ecommerce_banner_order_idx` (`order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
