const express = require("express");
const authorize = require("../../utils/authorize");
const requireSuperAdmin = require("../../utils/superAdmin");
const {
  // User management
  getAllUsers,
  getSingleUser,
  createUser,
  updateUser,
  deleteUser,
  // Company management
  getAllCompanies,
  getSingleCompany,
  createCompany,
  updateCompany,
  deleteCompany,
  // Company data viewing
  getCompanyStock,
  getCompanySales,
  getCompanyPurchases,
  getCompanyCustomers,
  getCompanySuppliers,
  getCompanyDashboard,
  // Master data - Products
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  // Master data - Book Publishers
  getAllBookPublishers,
  createBookPublisher,
  updateBookPublisher,
  deleteBookPublisher,
  // Master data - Product Categories
  getAllProductCategories,
  createProductCategory,
  updateProductCategory,
  deleteProductCategory,
  // Master data - Product Currencies
  getAllProductCurrencies,
  createProductCurrency,
  updateProductCurrency,
  deleteProductCurrency,
} = require("./superAdmin.controller");

const superAdminRoutes = express.Router();

// Middleware to check super admin - applies to all routes
superAdminRoutes.use(authorize()); // First authenticate JWT
superAdminRoutes.use(requireSuperAdmin()); // Then check if super admin

// User management routes
superAdminRoutes.get("/users", getAllUsers);
superAdminRoutes.get("/users/:id", getSingleUser);
superAdminRoutes.post("/users", createUser);
superAdminRoutes.put("/users/:id", updateUser);
superAdminRoutes.patch("/users/:id", deleteUser); // Deactivate/Activate

// Company management routes
superAdminRoutes.get("/companies", getAllCompanies);
superAdminRoutes.get("/companies/:id", getSingleCompany);
superAdminRoutes.post("/companies", createCompany);
superAdminRoutes.put("/companies/:id", updateCompany);
superAdminRoutes.patch("/companies/:id", deleteCompany); // Deactivate/Activate

// Company data viewing routes
superAdminRoutes.get("/companies/:companyId/stock", getCompanyStock);
superAdminRoutes.get("/companies/:companyId/sales", getCompanySales);
superAdminRoutes.get("/companies/:companyId/purchases", getCompanyPurchases);
superAdminRoutes.get("/companies/:companyId/customers", getCompanyCustomers);
superAdminRoutes.get("/companies/:companyId/suppliers", getCompanySuppliers);
superAdminRoutes.get("/companies/:companyId/dashboard", getCompanyDashboard);

// Master data - Products
superAdminRoutes.get("/products", getAllProducts);
superAdminRoutes.post("/products", createProduct);
superAdminRoutes.put("/products/:id", updateProduct);
superAdminRoutes.delete("/products/:id", deleteProduct);

// Master data - Book Publishers
superAdminRoutes.get("/book-publishers", getAllBookPublishers);
superAdminRoutes.post("/book-publishers", createBookPublisher);
superAdminRoutes.put("/book-publishers/:id", updateBookPublisher);
superAdminRoutes.delete("/book-publishers/:id", deleteBookPublisher);

// Master data - Product Categories
superAdminRoutes.get("/product-categories", getAllProductCategories);
superAdminRoutes.post("/product-categories", createProductCategory);
superAdminRoutes.put("/product-categories/:id", updateProductCategory);
superAdminRoutes.delete("/product-categories/:id", deleteProductCategory);

// Master data - Product Currencies
superAdminRoutes.get("/product-currencies", getAllProductCurrencies);
superAdminRoutes.post("/product-currencies", createProductCurrency);
superAdminRoutes.put("/product-currencies/:id", updateProductCurrency);
superAdminRoutes.delete("/product-currencies/:id", deleteProductCurrency);

module.exports = superAdminRoutes;
