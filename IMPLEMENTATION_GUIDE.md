# Sale/Quotation/Challan Implementation Guide

## Overview
This implementation adds support for three types of documents:
1. **Sale** - Full sale invoice with financial transactions and stock reduction
2. **Quotation** - Price quotation with no financial transactions or stock changes
3. **Challan** - Delivery challan with stock reduction but no financial transactions

## Changes Made

### 1. Database Schema (Prisma)
Updated `Backend/prisma/schema.prisma` to include:
- `quotationInvoice` model
- `quotationInvoiceProduct` model
- `challanInvoice` model
- `challanInvoiceProduct` model

Relations updated:
- `customer` model now includes `quotationInvoice[]` and `challanInvoice[]`
- `user` model now includes `quotationInvoice[]` and `challanInvoice[]`
- `product` model now includes `quotationInvoiceProduct[]` and `challanInvoiceProduct[]`

## SQL Queries to Run

Run the SQL queries from `Backend/add_quotation_challan_tables.sql` in your database to create the new tables.

```bash
# After running the SQL queries, generate Prisma client
cd Backend
npx prisma generate
```

## Next Steps (Pending Implementation)

### 2. Backend Controllers
Create/update controllers for:
- Quotation creation (no financial transactions, no stock changes)
- Challan creation (stock changes, no financial transactions)
- Conversion from Quotation/Challan to Sale

### 3. Frontend Changes

#### A. Add Sale Component (`Frontend/src/components/sale/addSale.js`)
Add a dropdown to select document type:
- Sale (default)
- Quotation
- Challan

Location: Add after invoice number field, before customer selection.

#### B. Update Sale List (`Frontend/src/components/sale/getAllSale.js`)
- Add filter for document type (Sale/Quotation/Challan)
- Add "Convert to Sale" button for Quotation and Challan rows
- Show document type in the list

#### C. Update PDF (`Frontend/src/components/Invoice/SaleInvoice.js`)
- Display document type in PDF header
- Adjust title based on document type

### 4. Redux Actions
Create new actions for:
- Create Quotation
- Create Challan
- Get All Quotations
- Get All Challans
- Convert Quotation/Challan to Sale

### 5. API Endpoints
Create/update routes for:
- POST `/v1/quotation` - Create quotation
- POST `/v1/challan` - Create challan
- GET `/v1/quotation` - Get all quotations
- GET `/v1/challan` - Get all challans
- POST `/v1/quotation/:id/convert` - Convert to sale
- POST `/v1/challan/:id/convert` - Convert to sale

## Implementation Logic

### Quotation
- No product quantity changes
- No financial transactions
- Saved to `quotationInvoice` table
- Can be converted to sale later

### Challan
- Product quantity decreases
- No financial transactions
- Saved to `challanInvoice` table
- Can be converted to sale later

### Sale
- Product quantity decreases
- Financial transactions created
- Saved to `saleInvoice` table
- Final invoice

## File Locations

- SQL Queries: `Backend/add_quotation_challan_tables.sql`
- Prisma Schema: `Backend/prisma/schema.prisma`
- Backend Controllers: `Backend/routes/sale/`
- Frontend Components: `Frontend/src/components/sale/`
- PDF Component: `Frontend/src/components/Invoice/SaleInvoice.js`

