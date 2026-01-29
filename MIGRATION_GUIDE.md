# Product Master Table Migration Guide

## Overview
This migration converts the `product` table from a company-specific table to a master table shared across all companies. Stock management is now handled through the `product_stock` table, and purchase/sale history is maintained in separate history tables.

## Changes Made

### 1. Schema Changes (`prisma/schema.prisma`)

#### Product Model
- **Removed**: `company_id` field and relation
- **Removed**: `quantity` field (moved to `product_stock`)
- **Changed**: ISBN constraint from `@@unique([isbn, company_id])` to `@@unique([isbn])` (globally unique)

#### New Tables Created

**product_stock**
- Manages stock quantity per company
- Fields: `product_id`, `company_id`, `quantity`, `reorder_quantity`
- Unique constraint on `(product_id, company_id)`

**product_purchase_history**
- Tracks all purchase transactions
- Fields: `product_id`, `company_id`, `purchase_invoice_id`, `supplier_id`, `quantity`, `purchase_price`, `discount`, `total_amount`, `purchase_date`, etc.

**product_sale_history**
- Tracks all sale transactions
- Fields: `product_id`, `company_id`, `sale_invoice_id`, `customer_id`, `user_id`, `quantity`, `sale_price`, `discount`, `total_amount`, `profit`, `sale_date`, etc.

### 2. Backend Controller Updates

#### Product Controller (`routes/inventory/product/product.controllers.js`)
- Removed all `company_id` checks for products
- Updated to use `product_stock` for quantity management
- Product creation now creates `product_stock` entry
- Product queries now join with `product_stock` to get quantities

#### Purchase Invoice Controller (`routes/purchase/purchaseInvoice/purchaseInvoice.controllers.js`)
- Removed product `company_id` validation
- Updates `product_stock` instead of `product.quantity`
- Creates `product_purchase_history` entries on purchase

#### Sale Invoice Controller (`routes/sale/saleInvoice/saleInvoice.controllers.js`)
- Removed product `company_id` validation
- Updates `product_stock` instead of `product.quantity`
- Creates `product_sale_history` entries on sale

#### Return Controllers
- **Return Purchase Invoice**: Updates `product_stock` (decrements quantity)
- **Return Sale Invoice**: Updates `product_stock` (increments quantity)

#### Other Controllers Updated
- `quotationInvoice.controllers.js`
- `challanInvoice.controllers.js`
- `editSaleInvoice.controllers.js`

## Migration Steps

### Step 1: Run Prisma Migration
```bash
cd Backend
npx prisma migrate dev --name make_product_master_table
```

This will:
- Create the new tables (`product_stock`, `product_purchase_history`, `product_sale_history`)
- Remove `company_id` and `quantity` from `product` table
- Update the ISBN unique constraint

### Step 2: Run Data Migration SQL
**IMPORTANT**: Backup your database before running this!

```bash
mysql -u your_username -p your_database < migration_product_master.sql
```

Or execute the SQL file manually in your MySQL client.

The migration script will:
1. Handle duplicate ISBNs across companies (keeps product with lowest ID)
2. Migrate purchase history from `purchaseInvoiceProduct`
3. Migrate sale history from `saleInvoiceProduct`
4. Create `product_stock` entries from existing product quantities
5. Update all foreign key references to use new product IDs
6. Delete duplicate products

### Step 3: Verify Migration
Run these queries to verify:

```sql
-- Check for duplicate ISBNs (should return 0 rows)
SELECT isbn, COUNT(*) as count 
FROM product 
GROUP BY isbn 
HAVING count > 1;

-- Check product_stock entries
SELECT COUNT(*) as stock_entries FROM product_stock;

-- Check purchase history entries
SELECT COUNT(*) as purchase_history_entries FROM product_purchase_history;

-- Check sale history entries
SELECT COUNT(*) as sale_history_entries FROM product_sale_history;

-- Verify products have stock entries
SELECT p.id, p.isbn, p.name, COUNT(ps.id) as stock_count
FROM product p
LEFT JOIN product_stock ps ON p.id = ps.product_id
GROUP BY p.id, p.isbn, p.name
HAVING stock_count = 0;
```

### Step 4: Update Frontend (if needed)
The frontend may need updates to:
- Remove `company_id` from product creation forms
- Display stock quantities from `product_stock` instead of `product.quantity`
- Handle the new API response structure

## API Changes

### Product Creation
**Before:**
```json
{
  "isbn": "123456",
  "name": "Book Name",
  "quantity": 100,
  "company_id": 1  // Required
}
```

**After:**
```json
{
  "isbn": "123456",
  "name": "Book Name"
  // quantity is managed via product_stock
  // company_id is automatically set from logged-in user
}
```

### Product Response
**Before:**
```json
{
  "id": 1,
  "isbn": "123456",
  "quantity": 100,
  "company_id": 1
}
```

**After:**
```json
{
  "id": 1,
  "isbn": "123456",
  "quantity": 100,  // From product_stock
  "product_stock": [{
    "quantity": 100,
    "reorder_quantity": 10
  }]
}
```

## Important Notes

1. **ISBN Uniqueness**: ISBNs are now globally unique. If multiple companies had the same ISBN, the migration keeps the product with the lowest ID and merges quantities.

2. **Stock Management**: Stock is now per-company. Each company has its own stock entry for each product.

3. **History Tracking**: All purchases and sales are now tracked in history tables, providing a complete audit trail.

4. **Backward Compatibility**: The API still returns `quantity` in product responses for backward compatibility, but it's sourced from `product_stock`.

5. **Product Master Data**: Product details (name, author, prices, etc.) are shared across all companies. Only stock quantities are company-specific.

## Rollback Plan

If you need to rollback:
1. Restore database from backup
2. Revert Prisma schema changes
3. Revert controller changes
4. Run `npx prisma migrate reset` (WARNING: This will delete all data)

## Support

If you encounter issues during migration:
1. Check the migration SQL logs for errors
2. Verify all foreign key constraints are satisfied
3. Ensure no duplicate ISBNs exist before migration
4. Check that all products have corresponding stock entries
