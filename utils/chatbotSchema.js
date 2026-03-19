/**
 * Schema description for the chatbot LLM - used for Text-to-SQL.
 * Tables and key columns. company_id tables require filtering by user's company.
 */
const TABLES_WITH_COMPANY_ID = new Set([
  "user",
  "designation",
  "product_category",
  "book_publisher",
  "product_currency",
  "supplier",
  "purchaseInvoice",
  "customer",
  "saleInvoice",
  "transaction",
  "role",
  "account",
  "returnPurchaseInvoice",
  "returnSaleInvoice",
  "quotationInvoice",
  "challanInvoice",
  "product_stock",
  "location",
  "stock",
  "product_purchase_history",
  "product_sale_history",
  "discount_master",
  "ecommerce_order",
  "sales_order",
  "purchase_order",
  "appSetting",
]);

const SCHEMA_DESCRIPTION = `
Database schema (MySQL). Use backticks for table/column names. Table names are case-sensitive.

TABLES WITH company_id (MUST filter by company_id = ? for each company-scoped table in the query):
- user: id, username, company_id, role, email
- designation: id, name, company_id
- product_category: id, name, company_id
- book_publisher: id, name, company_id, address, phone
- product_currency: id, name, symbol, company_id, conversion
- supplier: id, name, phone, address, company_id, status
- purchaseInvoice: id, date, invoice_number, prefix, total_amount, discount, supplier_id, company_id
- customer: id, name, phone, address, company_id, status
- saleInvoice: id, date, invoice_number, prefix, total_amount, discount, paid_amount, due_amount, profit, customer_id, user_id, company_id
- transaction: id, date, debit_id, credit_id, amount, company_id
- account: id, name, type, company_id
- returnPurchaseInvoice: id, date, total_amount, company_id
- returnSaleInvoice: id, date, total_amount, company_id
- quotationInvoice: id, date, invoice_number, total_amount, customer_id, company_id
- challanInvoice: id, date, invoice_number, total_amount, customer_id, company_id
- product_stock: id, product_id, company_id, quantity, reorder_quantity
- location: id, name, company_id
- stock: id, company_id, product_id, location_id, quantity, purchase_price, transaction_date (note: some columns may use camelCase in DB)
- product_purchase_history: id, product_id, company_id, quantity, purchase_price, total_amount, supplier_id
- product_sale_history: id, product_id, company_id, quantity, sale_price, total_amount, profit, customer_id
- discount_master: id, company_id, discount_type, publisher_id, customer_id, supplier_id
- sales_order: id, order_number, customer_id, company_id, total_amount, status
- purchase_order: id, order_number, supplier_id, company_id, total_amount, status
- appSetting: id, company_name, address, phone (companies table)

TABLES WITHOUT company_id (no filter needed):
- product: id, name, isbn, author, sale_price, purchase_price, product_category_id, book_publisher_id, status
- product_product_category: product_id, product_category_id
- purchaseInvoiceProduct: product_id, invoice_id, product_quantity, product_purchase_price
- saleInvoiceProduct: product_id, invoice_id, product_quantity, product_sale_price
- quotationInvoiceProduct: product_id, invoice_id, product_quantity, product_sale_price
- challanInvoiceProduct: product_id, invoice_id, product_quantity, product_sale_price
- subAccount: id, name, account_id
- permission: id, name
- rolePermission: role_id, permission_id

KEY RELATIONSHIPS:
- saleInvoice.customer_id -> customer.id
- saleInvoice.company_id -> appSetting.id
- purchaseInvoice.supplier_id -> supplier.id
- purchaseInvoice.company_id -> appSetting.id
- saleInvoiceProduct.invoice_id -> saleInvoice.id
- saleInvoiceProduct.product_id -> product.id
- product_sale_history has: product_id, company_id, customer_id, sale_invoice_id
- product_purchase_history has: product_id, company_id, supplier_id
- customer.company_id -> appSetting.id
- supplier.company_id -> appSetting.id
- challanInvoice.customer_id -> customer.id
- quotationInvoice.customer_id -> customer.id
- product_stock: product_id, company_id (unique per product+company)
- product.book_publisher_id -> book_publisher.id
- product.product_category_id -> product_category.id

IMPORTANT: When querying company-scoped tables, you MUST include "company_id = ?" in the WHERE clause for each such table. Use a single placeholder for the company_id value.
`;

module.exports = {
  TABLES_WITH_COMPANY_ID,
  SCHEMA_DESCRIPTION,
};
