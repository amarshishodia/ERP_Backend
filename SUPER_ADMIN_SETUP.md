# Super Admin Setup Guide

This guide explains how to set up and use the Super Admin functionality in the ERP Books system.

## Overview

The Super Admin feature allows a privileged user to:
1. View, create, edit, and activate/deactivate any user
2. View, create, edit, and activate/deactivate any company
3. View data of any company (stock, sales, purchases, customers, suppliers)
4. Manage master data (products, book publishers, product categories, product currencies)

## Database Setup

### Step 1: Run Migration

Execute the migration SQL script to add the required fields:

```bash
mysql -u your_username -p your_database < migration_super_admin.sql
```

Or manually run the SQL commands in `migration_super_admin.sql`.

### Step 2: Create Super Admin User

You can create a super admin user using one of these methods:

#### Method 1: Using Node.js Script

Create a file `create-super-admin.js`:

```javascript
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new PrismaClient();

async function createSuperAdmin() {
  const username = "superadmin"; // Change this
  const password = "your_password"; // Change this
  const email = "admin@erpbooks.com"; // Change this

  const hash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username,
      password: hash,
      email,
      role: "superAdmin",
      is_super_admin: true,
      status: true,
    },
  });

  console.log("Super admin created:", user);
  await prisma.$disconnect();
}

createSuperAdmin().catch(console.error);
```

Run it:
```bash
node create-super-admin.js
```

#### Method 2: Using SQL (Manual)

```sql
-- First, generate a bcrypt hash for your password using Node.js:
-- const bcrypt = require("bcrypt");
-- bcrypt.hash("your_password", 10).then(console.log);

INSERT INTO `user` (
  `username`, 
  `password`, 
  `role`, 
  `email`, 
  `status`, 
  `is_super_admin`,
  `createdAt`,
  `updatedAt`
) VALUES (
  'superadmin',
  '$2b$10$YOUR_BCRYPT_HASH_HERE', -- Replace with actual hash
  'superAdmin',
  'admin@erpbooks.com',
  TRUE,
  TRUE,
  NOW(),
  NOW()
);
```

## Backend API Endpoints

All super admin endpoints are prefixed with `/v1/super-admin` and require super admin authentication.

### Authentication
- **POST** `/v1/user/super-admin/login` - Super admin login
  ```json
  {
    "username": "superadmin",
    "password": "your_password"
  }
  ```

### User Management
- **GET** `/v1/super-admin/users` - Get all users
- **GET** `/v1/super-admin/users/:id` - Get single user
- **POST** `/v1/super-admin/users` - Create user
- **PUT** `/v1/super-admin/users/:id` - Update user
- **PATCH** `/v1/super-admin/users/:id` - Activate/deactivate user
  ```json
  {
    "status": true/false
  }
  ```

### Company Management
- **GET** `/v1/super-admin/companies` - Get all companies
- **GET** `/v1/super-admin/companies/:id` - Get single company
- **POST** `/v1/super-admin/companies` - Create company
- **PUT** `/v1/super-admin/companies/:id` - Update company
- **PATCH** `/v1/super-admin/companies/:id` - Activate/deactivate company

### Company Data Viewing
- **GET** `/v1/super-admin/companies/:companyId/dashboard` - Get company dashboard data
- **GET** `/v1/super-admin/companies/:companyId/stock` - Get company stock
- **GET** `/v1/super-admin/companies/:companyId/sales` - Get company sales
  - Query params: `startDate`, `endDate` (optional)
- **GET** `/v1/super-admin/companies/:companyId/purchases` - Get company purchases
  - Query params: `startDate`, `endDate` (optional)
- **GET** `/v1/super-admin/companies/:companyId/customers` - Get company customers
- **GET** `/v1/super-admin/companies/:companyId/suppliers` - Get company suppliers

### Master Data Management

#### Products
- **GET** `/v1/super-admin/products` - Get all products
- **POST** `/v1/super-admin/products` - Create product
- **PUT** `/v1/super-admin/products/:id` - Update product
- **DELETE** `/v1/super-admin/products/:id` - Delete product

#### Book Publishers
- **GET** `/v1/super-admin/book-publishers` - Get all book publishers
- **POST** `/v1/super-admin/book-publishers` - Create book publisher
- **PUT** `/v1/super-admin/book-publishers/:id` - Update book publisher
- **DELETE** `/v1/super-admin/book-publishers/:id` - Delete book publisher

#### Product Categories
- **GET** `/v1/super-admin/product-categories` - Get all product categories
- **POST** `/v1/super-admin/product-categories` - Create product category
- **PUT** `/v1/super-admin/product-categories/:id` - Update product category
- **DELETE** `/v1/super-admin/product-categories/:id` - Delete product category

#### Product Currencies
- **GET** `/v1/super-admin/product-currencies` - Get all product currencies
- **POST** `/v1/super-admin/product-currencies` - Create product currency
- **PUT** `/v1/super-admin/product-currencies/:id` - Update product currency
- **DELETE** `/v1/super-admin/product-currencies/:id` - Delete product currency

## Frontend Routes

- `/super-admin/login` - Super admin login page
- `/super-admin/dashboard` - Super admin dashboard
- `/super-admin/users` - User management page
- `/super-admin/companies` - Company management page
- `/super-admin/companies/:companyId/view` - View company data

## Security Notes

1. **Super Admin Protection**: Super admin users cannot be modified or deactivated through the regular user management endpoints. Only direct database access can modify super admin accounts.

2. **Token Expiry**: Super admin tokens expire after 24 hours, same as regular users.

3. **Authorization**: The `authorize` middleware has been updated to allow super admins to bypass permission checks. Super admins have access to all endpoints.

4. **Company Isolation**: Regular users can only see data from their own company. Super admins can view data from all companies.

## Troubleshooting

### Cannot login as super admin
- Verify that `is_super_admin` is set to `TRUE` in the database
- Check that the password hash is correct
- Ensure the user exists and `status` is `TRUE`

### Getting 403 Forbidden
- Verify you're using the super admin login endpoint (`/user/super-admin/login`)
- Check that the JWT token includes `isSuperAdmin: true` in the payload
- Ensure the user has `is_super_admin = TRUE` in the database

### Migration errors
- Make sure you're running the migration on the correct database
- Check that the `user` and `appSetting` tables exist
- Verify MySQL user has ALTER TABLE permissions

## Next Steps

After setup:
1. Log in as super admin at `/super-admin/login`
2. Access the dashboard at `/super-admin/dashboard`
3. Start managing users, companies, and master data
