const express = require("express");
const path = require("path");
const {
  getAllBanners,
  getBanner,
  createBanner,
  updateBanner,
  deleteBanner,
  getAllOrders,
  updateOrderStatus,
  getDashboardStats,
  toggleProductVisibility,
} = require("./admin.controllers");
const authorize = require("../../../utils/authorize");

const adminRoutes = express.Router();

// Middleware - require admin authentication
// For now, we'll use a simple check. You can enhance this with role-based access
adminRoutes.use(authorize()); // Require authentication

// Banner routes
adminRoutes.get("/banners", getAllBanners);
adminRoutes.get("/banners/:id", getBanner);
adminRoutes.post("/banners", createBanner);
adminRoutes.put("/banners/:id", updateBanner);
adminRoutes.delete("/banners/:id", deleteBanner);

// Serve banner images
adminRoutes.get("/banner-image/:filename", (req, res) => {
  const filename = req.params.filename;
  res.sendFile(path.join(__dirname, "uploads/banners", filename), (err) => {
    if (err) {
      res.status(404).send("Image not found");
    }
  });
});

// Order management routes
adminRoutes.get("/orders", getAllOrders);
adminRoutes.put("/orders/:id/status", updateOrderStatus);

// Dashboard routes
adminRoutes.get("/dashboard/stats", getDashboardStats);

// Product management routes
adminRoutes.put("/products/:id/visibility", toggleProductVisibility);

module.exports = adminRoutes;
