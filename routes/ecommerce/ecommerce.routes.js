const express = require("express");
const {
  getActiveBanners,
  getAllCompanies,
  getEcommerceProducts,
  getEcommerceProduct,
  addToWishlist,
  getWishlist,
  removeFromWishlist,
  addToCart,
  getCart,
  updateCartItem,
  removeFromCart,
  createOrder,
  getOrders,
  getOrder,
} = require("./ecommerce.controllers");

const ecommerceRoutes = express.Router();

// Public routes (no authentication required)
ecommerceRoutes.get("/banners", getActiveBanners);
ecommerceRoutes.get("/companies", getAllCompanies);
ecommerceRoutes.get("/products", getEcommerceProducts);
ecommerceRoutes.get("/products/:id", getEcommerceProduct);

// Wishlist routes
ecommerceRoutes.post("/wishlist", addToWishlist);
ecommerceRoutes.get("/wishlist", getWishlist);
ecommerceRoutes.delete("/wishlist/:id", removeFromWishlist);

// Cart routes
ecommerceRoutes.post("/cart", addToCart);
ecommerceRoutes.get("/cart", getCart);
ecommerceRoutes.put("/cart/:id", updateCartItem);
ecommerceRoutes.delete("/cart/:id", removeFromCart);

// Order routes
ecommerceRoutes.post("/orders", createOrder);
ecommerceRoutes.get("/orders", getOrders);
ecommerceRoutes.get("/orders/:id", getOrder);

module.exports = ecommerceRoutes;
