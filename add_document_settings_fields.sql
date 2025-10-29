-- Add Terms & Conditions and Prefix fields for Sale Invoice, Quotation, and Challan to appSetting table

ALTER TABLE `appSetting` 
  ADD COLUMN `sale_invoice_prefix` VARCHAR(191) NULL DEFAULT 'INV/25-26/' AFTER `terms`,
  ADD COLUMN `quotation_prefix` VARCHAR(191) NULL DEFAULT 'QTN/25-26/' AFTER `sale_invoice_prefix`,
  ADD COLUMN `challan_prefix` VARCHAR(191) NULL DEFAULT 'CHL/25-26/' AFTER `quotation_prefix`,
  ADD COLUMN `sale_invoice_terms` TEXT NULL AFTER `challan_prefix`,
  ADD COLUMN `quotation_terms` TEXT NULL AFTER `sale_invoice_terms`,
  ADD COLUMN `challan_terms` TEXT NULL AFTER `quotation_terms`;

