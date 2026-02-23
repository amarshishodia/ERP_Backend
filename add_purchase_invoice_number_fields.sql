-- Add purchase invoice prefix to appSetting and invoice_number/prefix to purchaseInvoice
-- Run this once. If columns already exist, skip or comment out the corresponding ALTER.

-- 1. Add purchase_invoice_prefix to appSetting (company-wise, like sale_invoice_prefix)
ALTER TABLE `appSetting`
  ADD COLUMN `purchase_invoice_prefix` VARCHAR(191) NULL DEFAULT 'PINV/25-26/' AFTER `challan_prefix`;

-- 2. Add invoice_number and prefix to purchaseInvoice for company-wise numbering
ALTER TABLE `purchaseInvoice`
  ADD COLUMN `invoice_number` INT NULL AFTER `date`,
  ADD COLUMN `prefix` VARCHAR(191) NULL AFTER `invoice_number`;

-- Optional: backfill existing rows so they display with a number (e.g. PINV/25-26/1, 2, 3...)
-- UPDATE `purchaseInvoice` SET `prefix` = 'PINV/25-26/', `invoice_number` = `id` WHERE `invoice_number` IS NULL;
