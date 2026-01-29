const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config();

const HOST = process.env.HOST || "http://localhost";
const PORT = process.env.PORT || 5001;

// Generate random file name
const generateFileName = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

// Configure multer for banner images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "routes/ecommerce/admin/uploads/banners/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = generateFileName();
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed"));
  },
}).single("image");

// ============================================
// BANNER MANAGEMENT
// ============================================

// Get all banners
const getAllBanners = async (req, res) => {
  try {
    const { position, status } = req.query;
    const where = {};
    if (position) where.position = position;
    if (status !== undefined) where.status = status === "true";

    const banners = await prisma.ecommerce_banner.findMany({
      where,
      orderBy: [{ order: "asc" }, { created_at: "desc" }],
    });

    const bannersWithUrl = banners.map((banner) => ({
      ...banner,
        image_url: banner.image_url.startsWith("http")
        ? banner.image_url
        : `${HOST}:${PORT}/v1/ecommerce/admin/banner-image/${path.basename(banner.image_url)}`,
    }));

    res.json(bannersWithUrl);
  } catch (error) {
    console.error("Get banners error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get single banner
const getBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await prisma.ecommerce_banner.findUnique({
      where: { id: parseInt(id) },
    });

    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    res.json({
      ...banner,
        image_url: banner.image_url.startsWith("http")
        ? banner.image_url
        : `${HOST}:${PORT}/v1/ecommerce/admin/banner-image/${path.basename(banner.image_url)}`,
    });
  } catch (error) {
    console.error("Get banner error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Create banner
const createBanner = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      const { title, description, link_url, position, order, status, start_date, end_date } = req.body;

      if (!req.file) {
        return res.status(400).json({ message: "Image is required" });
      }

      const banner = await prisma.ecommerce_banner.create({
        data: {
          title: title || null,
          description: description || null,
          image_url: req.file.path,
          link_url: link_url || null,
          position: position || "homepage",
          order: order ? parseInt(order) : 0,
          status: status === "false" ? false : true,
          start_date: start_date ? new Date(start_date) : null,
          end_date: end_date ? new Date(end_date) : null,
        },
      });

      res.json({
        ...banner,
        image_url: `${HOST}:${PORT}/v1/ecommerce/admin/banner-image/${path.basename(banner.image_url)}`,
      });
    } catch (error) {
      console.error("Create banner error:", error);
      res.status(500).json({ message: error.message });
    }
  });
};

// Update banner
const updateBanner = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      const { id } = req.params;
      const { title, description, link_url, position, order, status, start_date, end_date } = req.body;

      const existingBanner = await prisma.ecommerce_banner.findUnique({
        where: { id: parseInt(id) },
      });

      if (!existingBanner) {
        return res.status(404).json({ message: "Banner not found" });
      }

      const updateData = {
        title: title !== undefined ? (title || null) : existingBanner.title,
        description: description !== undefined ? (description || null) : existingBanner.description,
        link_url: link_url !== undefined ? (link_url || null) : existingBanner.link_url,
        position: position || existingBanner.position,
        order: order !== undefined ? parseInt(order) : existingBanner.order,
        status: status !== undefined ? status === "true" : existingBanner.status,
        start_date: start_date !== undefined ? (start_date ? new Date(start_date) : null) : existingBanner.start_date,
        end_date: end_date !== undefined ? (end_date ? new Date(end_date) : null) : existingBanner.end_date,
      };

      if (req.file) {
        updateData.image_url = req.file.path;
      }

      const banner = await prisma.ecommerce_banner.update({
        where: { id: parseInt(id) },
        data: updateData,
      });

      res.json({
        ...banner,
        image_url: banner.image_url.startsWith("http")
          ? banner.image_url
          : `${HOST}:${PORT}/v1/ecommerce/admin/banner-image/${path.basename(banner.image_url)}`,
      });
    } catch (error) {
      console.error("Update banner error:", error);
      res.status(500).json({ message: error.message });
    }
  });
};

// Delete banner
const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.ecommerce_banner.delete({
      where: { id: parseInt(id) },
    });
    res.json({ message: "Banner deleted successfully" });
  } catch (error) {
    console.error("Delete banner error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// ORDER MANAGEMENT
// ============================================

// Get all orders (admin)
const getAllOrders = async (req, res) => {
  try {
    const { status, payment_status, page = 1, limit = 20, start_date, end_date } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) where.status = status;
    if (payment_status) where.payment_status = payment_status;
    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) where.created_at.gte = new Date(start_date);
      if (end_date) where.created_at.lte = new Date(end_date);
    }

    const [orders, total] = await Promise.all([
      prisma.ecommerce_order.findMany({
        where,
        include: {
          order_items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  imageName: true,
                },
              },
            },
          },
          company: {
            select: {
              id: true,
              company_name: true,
            },
          },
        },
        orderBy: { created_at: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.ecommerce_order.count({ where }),
    ]);

    res.json({
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Update order status
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payment_status } = req.body;

    const order = await prisma.ecommerce_order.findUnique({
      where: { id: parseInt(id) },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (payment_status) updateData.payment_status = payment_status;

    const updatedOrder = await prisma.ecommerce_order.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        order_items: {
          include: {
            product: true,
          },
        },
      },
    });

    res.json(updatedOrder);
  } catch (error) {
    console.error("Update order status error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// DASHBOARD STATS
// ============================================

// Get dashboard statistics
const getDashboardStats = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const dateFilter = {};
    if (start_date || end_date) {
      dateFilter.created_at = {};
      if (start_date) dateFilter.created_at.gte = new Date(start_date);
      if (end_date) dateFilter.created_at.lte = new Date(end_date);
    }

    const [
      totalOrders,
      totalRevenue,
      totalProducts,
      pendingOrders,
      completedOrders,
      totalCustomers,
      recentOrders,
    ] = await Promise.all([
      prisma.ecommerce_order.count({ where: dateFilter }),
      prisma.ecommerce_order.aggregate({
        where: dateFilter,
        _sum: { total_amount: true },
      }),
      prisma.product.count({ where: { status: true } }),
      prisma.ecommerce_order.count({
        where: { ...dateFilter, status: "pending" },
      }),
      prisma.ecommerce_order.count({
        where: { ...dateFilter, status: "delivered" },
      }),
      prisma.ecommerce_order.groupBy({
        by: ["customer_id"],
        where: { ...dateFilter, customer_id: { not: null } },
      }).then((result) => result.length),
      prisma.ecommerce_order.findMany({
        where: dateFilter,
        include: {
          order_items: {
            include: {
              product: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { created_at: "desc" },
        take: 10,
      }),
    ]);

    res.json({
      totalOrders,
      totalRevenue: totalRevenue._sum.total_amount || 0,
      totalProducts,
      pendingOrders,
      completedOrders,
      totalCustomers,
      recentOrders,
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// PRODUCT VISIBILITY MANAGEMENT
// ============================================

// Toggle product visibility for e-commerce
const toggleProductVisibility = async (req, res) => {
  try {
    const { id } = req.params;
    const { visible } = req.body;

    // Note: This would require adding an ecommerce_visible field to product model
    // For now, we'll use the status field
    const product = await prisma.product.update({
      where: { id: parseInt(id) },
      data: { status: visible },
    });

    res.json(product);
  } catch (error) {
    console.error("Toggle product visibility error:", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAllBanners,
  getBanner,
  createBanner,
  updateBanner,
  deleteBanner,
  getAllOrders,
  updateOrderStatus,
  getDashboardStats,
  toggleProductVisibility,
};
