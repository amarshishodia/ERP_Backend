-- SQL queries to add Quotation and Challan tables

-- 1. Create quotationInvoice table (similar to saleInvoice but without financial transactions)
CREATE TABLE IF NOT EXISTS `quotationInvoice` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `date` DATETIME(3) NOT NULL,
  `invoice_number` INT NOT NULL,
  `total_amount` DOUBLE PRECISION NOT NULL,
  `discount` DOUBLE PRECISION NOT NULL DEFAULT 0,
  `total_product_discount` DOUBLE PRECISION,
  `total_product_qty` INT,
  `customer_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `note` VARCHAR(191),
  `invoice_order_date` DATETIME(3),
  `invoice_order_number` VARCHAR(191),
  `prefix` VARCHAR(191),
  `round_off_enabled` BOOLEAN DEFAULT false,
  `round_off_amount` DOUBLE PRECISION DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `quotationInvoice_customer_id_fkey` (`customer_id`),
  INDEX `quotationInvoice_user_id_fkey` (`user_id`),
  CONSTRAINT `quotationInvoice_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customer` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `quotationInvoice_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Create quotationInvoiceProduct table
CREATE TABLE IF NOT EXISTS `quotationInvoiceProduct` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `product_id` INT NOT NULL,
  `invoice_id` INT NOT NULL,
  `product_quantity` INT NOT NULL,
  `product_sale_price` DOUBLE PRECISION NOT NULL,
  `product_sale_discount` DOUBLE PRECISION,
  `product_sale_currency` VARCHAR(191),
  `product_sale_conversion` DOUBLE PRECISION,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `quotationInvoiceProduct_invoice_id_fkey` (`invoice_id`),
  INDEX `quotationInvoiceProduct_product_id_fkey` (`product_id`),
  CONSTRAINT `quotationInvoiceProduct_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `quotationInvoice` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `quotationInvoiceProduct_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `product` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. Create challanInvoice table (similar to saleInvoice but without financial transactions)
CREATE TABLE IF NOT EXISTS `challanInvoice` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `date` DATETIME(3) NOT NULL,
  `invoice_number` INT NOT NULL,
  `total_amount` DOUBLE PRECISION NOT NULL,
  `discount` DOUBLE PRECISION NOT NULL DEFAULT 0,
  `total_product_discount` DOUBLE PRECISION,
  `total_product_qty` INT,
  `customer_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `note` VARCHAR(191),
  `invoice_order_date` DATETIME(3),
  `invoice_order_number` VARCHAR(191),
  `prefix` VARCHAR(191),
  `round_off_enabled` BOOLEAN DEFAULT false,
  `round_off_amount` DOUBLE PRECISION DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `challanInvoice_customer_id_fkey` (`customer_id`),
  INDEX `challanInvoice_user_id_fkey` (`user_id`),
  CONSTRAINT `challanInvoice_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customer` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `challanInvoice_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4. Create challanInvoiceProduct table
CREATE TABLE IF NOT EXISTS `challanInvoiceProduct` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `product_id` INT NOT NULL,
  `invoice_id` INT NOT NULL,
  `product_quantity` INT NOT NULL,
  `product_sale_price` DOUBLE PRECISION NOT NULL,
  `product_sale_discount` DOUBLE PRECISION,
  `product_sale_currency` VARCHAR(191),
  `product_sale_conversion` DOUBLE PRECISION,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `challanInvoiceProduct_invoice_id_fkey` (`invoice_id`),
  INDEX `challanInvoiceProduct_product_id_fkey` (`product_id`),
  CONSTRAINT `challanInvoiceProduct_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `challanInvoice` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `challanInvoiceProduct_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `product` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

