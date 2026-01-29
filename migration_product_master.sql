-- Migration Script: Convert Product to Master Table
-- This script migrates the database to make products master (shared across companies)
-- and creates product_stock, product_purchase_history, and product_sale_history tables

-- ============================================================================
-- STEP 1: Create new tables (product_stock, product_purchase_history, product_sale_history)
-- ============================================================================

-- Create product_stock table
CREATE TABLE IF NOT EXISTS product_stock (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    company_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    reorder_quantity INT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY product_stock_product_id_company_id_key (product_id, company_id),
    KEY product_stock_product_id_idx (product_id),
    KEY product_stock_company_id_idx (company_id),
    CONSTRAINT product_stock_product_id_fkey FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE,
    CONSTRAINT product_stock_company_id_fkey FOREIGN KEY (company_id) REFERENCES appSetting(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create product_purchase_history table
CREATE TABLE IF NOT EXISTS product_purchase_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    company_id INT NOT NULL,
    purchase_invoice_id INT NULL,
    supplier_id INT NULL,
    quantity INT NOT NULL,
    purchase_price DOUBLE PRECISION NOT NULL,
    discount DOUBLE PRECISION NULL DEFAULT 0,
    total_amount DOUBLE PRECISION NOT NULL,
    purchase_date DATETIME(3) NOT NULL,
    note TEXT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY product_purchase_history_product_id_idx (product_id),
    KEY product_purchase_history_company_id_idx (company_id),
    KEY product_purchase_history_purchase_invoice_id_idx (purchase_invoice_id),
    KEY product_purchase_history_supplier_id_idx (supplier_id),
    KEY product_purchase_history_purchase_date_idx (purchase_date),
    CONSTRAINT product_purchase_history_product_id_fkey FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE,
    CONSTRAINT product_purchase_history_company_id_fkey FOREIGN KEY (company_id) REFERENCES appSetting(id) ON DELETE CASCADE,
    CONSTRAINT product_purchase_history_purchase_invoice_id_fkey FOREIGN KEY (purchase_invoice_id) REFERENCES purchaseInvoice(id) ON DELETE SET NULL,
    CONSTRAINT product_purchase_history_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create product_sale_history table
CREATE TABLE IF NOT EXISTS product_sale_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    company_id INT NOT NULL,
    sale_invoice_id INT NULL,
    customer_id INT NULL,
    user_id INT NULL,
    quantity INT NOT NULL,
    sale_price DOUBLE PRECISION NOT NULL,
    discount DOUBLE PRECISION NULL DEFAULT 0,
    total_amount DOUBLE PRECISION NOT NULL,
    profit DOUBLE PRECISION NULL,
    sale_date DATETIME(3) NOT NULL,
    note TEXT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY product_sale_history_product_id_idx (product_id),
    KEY product_sale_history_company_id_idx (company_id),
    KEY product_sale_history_sale_invoice_id_idx (sale_invoice_id),
    KEY product_sale_history_customer_id_idx (customer_id),
    KEY product_sale_history_user_id_idx (user_id),
    KEY product_sale_history_sale_date_idx (sale_date),
    CONSTRAINT product_sale_history_product_id_fkey FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE,
    CONSTRAINT product_sale_history_company_id_fkey FOREIGN KEY (company_id) REFERENCES appSetting(id) ON DELETE CASCADE,
    CONSTRAINT product_sale_history_sale_invoice_id_fkey FOREIGN KEY (sale_invoice_id) REFERENCES saleInvoice(id) ON DELETE SET NULL,
    CONSTRAINT product_sale_history_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customer(id) ON DELETE SET NULL,
    CONSTRAINT product_sale_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- STEP 2: Handle duplicate ISBNs across companies
-- ============================================================================
-- First, identify duplicate ISBNs
-- Keep the product with the lowest ID (or most recent, adjust as needed)
-- For duplicates, we'll merge quantities and update references

-- Create a temporary table to track which products to keep
CREATE TEMPORARY TABLE IF NOT EXISTS product_keep AS
SELECT MIN(id) as id, isbn, GROUP_CONCAT(id ORDER BY id) as all_ids
FROM product
GROUP BY isbn
HAVING COUNT(*) > 1;

-- Create a mapping table for product ID changes
CREATE TEMPORARY TABLE IF NOT EXISTS product_id_mapping AS
SELECT 
    p.id as old_id,
    pk.id as new_id
FROM product p
JOIN product_keep pk ON p.isbn = pk.isbn
WHERE p.id != pk.id;

-- ============================================================================
-- STEP 3: Migrate purchase history from purchaseInvoiceProduct
-- ============================================================================
-- Insert purchase history records from existing purchase invoices
INSERT INTO product_purchase_history (
    product_id,
    company_id,
    purchase_invoice_id,
    supplier_id,
    quantity,
    purchase_price,
    discount,
    total_amount,
    purchase_date,
    note,
    created_at,
    updated_at
)
SELECT 
    COALESCE(pim.new_id, pip.product_id) as product_id,
    pi.company_id,
    pip.invoice_id as purchase_invoice_id,
    pi.supplier_id,
    pip.product_quantity as quantity,
    pip.product_purchase_price as purchase_price,
    COALESCE(pip.product_purchase_discount, 0) as discount,
    (pip.product_purchase_price * pip.product_quantity * (1 - COALESCE(pip.product_purchase_discount, 0) / 100)) as total_amount,
    pi.date as purchase_date,
    pi.note,
    pip.created_at,
    pip.updated_at
FROM purchaseInvoiceProduct pip
JOIN purchaseInvoice pi ON pip.invoice_id = pi.id
LEFT JOIN product_id_mapping pim ON pip.product_id = pim.old_id;

-- ============================================================================
-- STEP 4: Migrate sale history from saleInvoiceProduct
-- ============================================================================
-- Insert sale history records from existing sale invoices
INSERT INTO product_sale_history (
    product_id,
    company_id,
    sale_invoice_id,
    customer_id,
    user_id,
    quantity,
    sale_price,
    discount,
    total_amount,
    profit,
    sale_date,
    note,
    created_at,
    updated_at
)
SELECT 
    COALESCE(pim.new_id, sip.product_id) as product_id,
    si.company_id,
    sip.invoice_id as sale_invoice_id,
    si.customer_id,
    si.user_id,
    sip.product_quantity as quantity,
    sip.product_sale_price as sale_price,
    COALESCE(sip.product_sale_discount, 0) as discount,
    (sip.product_sale_price * sip.product_quantity * COALESCE(sip.product_sale_conversion, 1) * (1 - COALESCE(sip.product_sale_discount, 0) / 100)) as total_amount,
    NULL as profit, -- Will be calculated if needed
    si.date as sale_date,
    si.note,
    sip.created_at,
    sip.updated_at
FROM saleInvoiceProduct sip
JOIN saleInvoice si ON sip.invoice_id = si.id
LEFT JOIN product_id_mapping pim ON sip.product_id = pim.old_id;

-- ============================================================================
-- STEP 5: Create product_stock entries from existing product quantities
-- ============================================================================
-- Insert stock records for each product-company combination
INSERT INTO product_stock (
    product_id,
    company_id,
    quantity,
    reorder_quantity,
    created_at,
    updated_at
)
SELECT 
    COALESCE(pim.new_id, p.id) as product_id,
    p.company_id,
    p.quantity,
    p.reorder_quantity,
    p.created_at,
    p.updated_at
FROM product p
LEFT JOIN product_id_mapping pim ON p.id = pim.old_id
WHERE p.quantity > 0 OR p.reorder_quantity IS NOT NULL
ON DUPLICATE KEY UPDATE
    quantity = VALUES(quantity) + product_stock.quantity,
    reorder_quantity = COALESCE(VALUES(reorder_quantity), product_stock.reorder_quantity);

-- ============================================================================
-- STEP 6: Update foreign key references to use new product IDs
-- ============================================================================
-- Update purchaseInvoiceProduct
UPDATE purchaseInvoiceProduct pip
JOIN product_id_mapping pim ON pip.product_id = pim.old_id
SET pip.product_id = pim.new_id;

-- Update saleInvoiceProduct
UPDATE saleInvoiceProduct sip
JOIN product_id_mapping pim ON sip.product_id = pim.old_id
SET sip.product_id = pim.new_id;

-- Update returnPurchaseInvoiceProduct
UPDATE returnPurchaseInvoiceProduct rpip
JOIN product_id_mapping pim ON rpip.product_id = pim.old_id
SET rpip.product_id = pim.new_id;

-- Update returnSaleInvoiceProduct
UPDATE returnSaleInvoiceProduct rsip
JOIN product_id_mapping pim ON rsip.product_id = pim.old_id
SET rsip.product_id = pim.new_id;

-- Update quotationInvoiceProduct
UPDATE quotationInvoiceProduct qip
JOIN product_id_mapping pim ON qip.product_id = pim.old_id
SET qip.product_id = pim.new_id;

-- Update challanInvoiceProduct
UPDATE challanInvoiceProduct cip
JOIN product_id_mapping pim ON cip.product_id = pim.old_id
SET cip.product_id = pim.new_id;

-- ============================================================================
-- STEP 7: Delete duplicate products (keep only the one with lowest ID)
-- ============================================================================
DELETE p FROM product p
JOIN product_id_mapping pim ON p.id = pim.old_id;

-- ============================================================================
-- STEP 8: Remove company_id and quantity columns from product table
-- ============================================================================
-- Note: This should be done via Prisma migration, but here's the SQL for reference
-- ALTER TABLE product DROP FOREIGN KEY product_company_id_fkey;
-- ALTER TABLE product DROP INDEX product_company_id_idx;
-- ALTER TABLE product DROP COLUMN company_id;
-- ALTER TABLE product DROP COLUMN quantity;

-- ============================================================================
-- STEP 9: Update unique constraint on ISBN
-- ============================================================================
-- Note: This should be done via Prisma migration
-- ALTER TABLE product DROP INDEX product_isbn_company_id_unique;
-- ALTER TABLE product ADD UNIQUE INDEX product_isbn_unique (isbn);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Check for any remaining duplicate ISBNs
-- SELECT isbn, COUNT(*) as count FROM product GROUP BY isbn HAVING count > 1;

-- Check product_stock entries
-- SELECT COUNT(*) as stock_entries FROM product_stock;

-- Check purchase history entries
-- SELECT COUNT(*) as purchase_history_entries FROM product_purchase_history;

-- Check sale history entries
-- SELECT COUNT(*) as sale_history_entries FROM product_sale_history;

-- Verify all products have stock entries (if needed)
-- SELECT p.id, p.isbn, p.name, COUNT(ps.id) as stock_count
-- FROM product p
-- LEFT JOIN product_stock ps ON p.id = ps.product_id
-- GROUP BY p.id, p.isbn, p.name
-- HAVING stock_count = 0;
