const prisma = require("../../utils/prisma");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const HOST = process.env.HOST || "http://localhost";
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || "ecommerce-secret-key";
const SALT_ROUNDS = 10;

// Optional auth: set req.ecommerceUser = { id } when valid Bearer token, else null
const optionalEcommerceAuth = (req, res, next) => {
  req.ecommerceUser = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.sub) req.ecommerceUser = { id: decoded.sub };
    } catch (_) {}
  }
  next();
};

// ----- E-commerce Auth (no company_id) -----

const ecommerceSignup = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const existingUsername = await prisma.user.findFirst({
      where: { username: username.trim() },
    });
    if (existingUsername) {
      return res.status(400).json({ message: "Username is already taken" });
    }

    if (email) {
      const existingEmail = await prisma.user.findFirst({
        where: { email: email.trim() },
      });
      if (existingEmail) {
        return res.status(400).json({ message: "Email is already registered" });
      }
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        password: hash,
        email: email ? email.trim() : null,
        role: "customer",
        company_id: null,
      },
    });

    const token = jwt.sign(
      { sub: user.id },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json({
      message: "Account created successfully",
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    console.error("Ecommerce signup error:", error);
    res.status(500).json({ message: error.message });
  }
};

const ecommerceLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username.trim() },
          { email: username.trim() },
        ],
        status: true,
      },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid username or password" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ message: "Invalid username or password" });
    }

    const token = jwt.sign(
      { sub: user.id },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    console.error("Ecommerce login error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get active banners for public display
const getActiveBanners = async (req, res) => {
  try {
    const { position } = req.query;
    const where = {
      status: true,
    };
    if (position) {
      where.position = position;
    }

    // Check date range - banner is active if:
    // - start_date is null OR start_date <= now
    // AND
    // - end_date is null OR end_date >= now
    const now = new Date();
    where.AND = [
      {
        OR: [
          { start_date: null },
          { start_date: { lte: now } },
        ],
      },
      {
        OR: [
          { end_date: null },
          { end_date: { gte: now } },
        ],
      },
    ];

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
    console.error("Get active banners error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get all companies/clients for e-commerce
const getAllCompanies = async (req, res) => {
  try {
    const companies = await prisma.appSetting.findMany({
      where: {
        status: true,
      },
      select: {
        id: true,
        company_name: true,
        address: true,
        phone: true,
        email: true,
        website: true,
        logo: true,
      },
      orderBy: {
        company_name: "asc",
      },
    });
    res.json(companies);
  } catch (error) {
    console.error("Get companies error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get products for e-commerce (with optional company filter)
const getEcommerceProducts = async (req, res) => {
  try {
    const { company_id, search, category_id, publisher_id, min_price, max_price, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause for products
    const productWhere = {
      status: true,
    };

    if (search) {
      productWhere.OR = [
        { name: { contains: search } },
        { author: { contains: search } },
        { isbn: { contains: search } },
        { sku: { contains: search } },
      ];
    }

    if (category_id) {
      productWhere.product_categories = {
        some: {
          product_category_id: parseInt(category_id),
        },
      };
    }

    if (publisher_id) {
      productWhere.book_publisher_id = parseInt(publisher_id);
    }

    // Build stock filter
    const stockWhere = {};
    if (company_id) {
      stockWhere.company_id = parseInt(company_id);
      stockWhere.quantity = { gt: 0 }; // Only show products with stock
    }

    // Get all matching products (no skip/take yet) so we can sort by sales and stock
    const products = await prisma.product.findMany({
      where: productWhere,
      include: {
        product_category: true,
        product_categories: {
          include: {
            product_category: true,
          },
        },
        book_publisher: true,
        product_currency: true,
        product_stock: {
          where: stockWhere,
          include: {
            company: {
              select: {
                id: true,
                company_name: true,
              },
            },
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    // Map to response shape and compute available_quantity; keep created_at for sorting
    let filteredProducts = products.map((product) => {
      const stocks = company_id
        ? product.product_stock.filter((s) => s.company_id === parseInt(company_id))
        : product.product_stock.filter((s) => s.quantity > 0);
      const availableStock = stocks.length > 0 ? stocks[0] : null;
      const available_quantity = availableStock ? availableStock.quantity : 0;

      return {
        id: product.id,
        name: product.name,
        isbn: product.isbn,
        author: product.author,
        sale_price: product.sale_price,
        purchase_price: product.purchase_price,
        imageName: product.imageName,
        imageUrl: product.imageName ? `${HOST}/v1/product-image/${product.imageName}` : null,
        category: product.product_category,
        categories: product.product_categories.map((pc) => pc.product_category),
        publisher: product.book_publisher,
        currency: product.product_currency,
        sku: product.sku,
        unit_measurement: product.unit_measurement,
        unit_type: product.unit_type,
        available_quantity,
        company: availableStock ? availableStock.company : null,
        all_stocks: company_id ? [] : stocks.map((s) => ({
          company_id: s.company_id,
          company_name: s.company.company_name,
          quantity: s.quantity,
        })),
        created_at: product.created_at,
      };
    });

    // Filter by price range
    if (min_price) {
      filteredProducts = filteredProducts.filter((p) => p.sale_price >= parseFloat(min_price));
    }
    if (max_price) {
      filteredProducts = filteredProducts.filter((p) => p.sale_price <= parseFloat(max_price));
    }

    // Filter out products with no available stock if company is selected
    if (company_id) {
      filteredProducts = filteredProducts.filter((p) => p.available_quantity > 0);
    }

    // Get total quantity sold per product (from ecommerce orders) for ordering
    const productIds = filteredProducts.map((p) => p.id);
    const soldAggregate = productIds.length > 0
      ? await prisma.ecommerce_order_item.groupBy({
          by: ["product_id"],
          where: { product_id: { in: productIds } },
          _sum: { quantity: true },
        })
      : [];
    const totalSoldByProductId = soldAggregate.reduce((acc, row) => {
      acc[row.product_id] = row._sum.quantity ?? 0;
      return acc;
    }, {});

    // Add total_sold for sorting (do not expose in final response)
    filteredProducts.forEach((p) => {
      p._totalSold = totalSoldByProductId[p.id] ?? 0;
    });

    // Order: 1) high-selling (total sold DESC), 2) in-stock (available_quantity > 0), 3) others (created_at DESC)
    filteredProducts.sort((a, b) => {
      if (b._totalSold !== a._totalSold) return b._totalSold - a._totalSold;
      const aInStock = a.available_quantity > 0 ? 1 : 0;
      const bInStock = b.available_quantity > 0 ? 1 : 0;
      if (bInStock !== aInStock) return bInStock - aInStock;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    const totalProducts = filteredProducts.length;
    const limitNum = parseInt(limit);
    const paginated = filteredProducts.slice(skip, skip + limitNum);

    // Remove internal sort fields from response
    const cleanProducts = paginated.map(({ _totalSold, created_at, ...rest }) => rest);

    res.json({
      products: cleanProducts,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        total: totalProducts,
        totalPages: Math.ceil(totalProducts / limitNum),
      },
    });
  } catch (error) {
    console.error("Get ecommerce products error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get single product for e-commerce
const getEcommerceProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.query;

    const product = await prisma.product.findUnique({
      where: { id: parseInt(id) },
      include: {
        product_category: true,
        product_categories: {
          include: {
            product_category: true,
          },
        },
        book_publisher: true,
        product_currency: true,
        product_stock: {
          where: company_id
            ? { company_id: parseInt(company_id), quantity: { gt: 0 } }
            : { quantity: { gt: 0 } },
          include: {
            company: {
              select: {
                id: true,
                company_name: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const stocks = company_id
      ? product.product_stock.filter((s) => s.company_id === parseInt(company_id))
      : product.product_stock;

    res.json({
      id: product.id,
      name: product.name,
      isbn: product.isbn,
      author: product.author,
      sale_price: product.sale_price,
      purchase_price: product.purchase_price,
      imageName: product.imageName,
      imageUrl: product.imageName ? `${HOST}/v1/product-image/${product.imageName}` : null,
      category: product.product_category,
      categories: product.product_categories.map((pc) => pc.product_category),
      publisher: product.book_publisher,
      currency: product.product_currency,
      sku: product.sku,
      unit_measurement: product.unit_measurement,
      unit_type: product.unit_type,
      available_quantity: stocks.length > 0 ? stocks.reduce((sum, s) => sum + s.quantity, 0) : 0,
      stocks: stocks.map((s) => ({
        company_id: s.company_id,
        company_name: s.company.company_name,
        quantity: s.quantity,
      })),
    });
  } catch (error) {
    console.error("Get ecommerce product error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Add to wishlist
const addToWishlist = async (req, res) => {
  try {
    const { product_id, customer_id, session_id } = req.body;
    const userId = req.ecommerceUser?.id;

    if (!product_id) {
      return res.status(400).json({ message: "Product ID is required" });
    }

    // Logged-in e-commerce user: use customer_id (user id); else guest: body customer_id or session_id
    const finalSessionId = session_id || uuidv4();
    const useUserId = !!userId;
    if (!useUserId && !customer_id && !session_id) {
      return res.status(400).json({ message: "Authentication or session_id is required" });
    }

    const product = await prisma.product.findUnique({
      where: { id: parseInt(product_id) },
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const existingWhere = {
      product_id: parseInt(product_id),
      ...(useUserId ? { customer_id: userId } : customer_id ? { customer_id: parseInt(customer_id) } : { session_id: finalSessionId }),
    };
    const existing = await prisma.ecommerce_wishlist.findFirst({
      where: existingWhere,
    });

    if (existing) {
      return res.status(400).json({ message: "Product already in wishlist" });
    }

    const createData = {
      product_id: parseInt(product_id),
      ...(useUserId ? { customer_id: userId, session_id: null } : customer_id ? { customer_id: parseInt(customer_id), session_id: null } : { session_id: finalSessionId, customer_id: null }),
    };
    const wishlistItem = await prisma.ecommerce_wishlist.create({
      data: createData,
      include: {
        product: {
          include: {
            product_category: true,
            book_publisher: true,
            product_currency: true,
          },
        },
      },
    });

    res.json({
      ...wishlistItem,
      product: {
        ...wishlistItem.product,
        imageUrl: wishlistItem.product.imageName
          ? `${HOST}/v1/product-image/${wishlistItem.product.imageName}`
          : null,
      },
      session_id: finalSessionId,
    });
  } catch (error) {
    console.error("Add to wishlist error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get wishlist
const getWishlist = async (req, res) => {
  try {
    const userId = req.ecommerceUser?.id;
    const { customer_id, session_id } = req.query;

    if (!userId && !customer_id && !session_id) {
      return res.status(400).json({ message: "Authentication or customer_id or session_id is required" });
    }

    const where = userId ? { customer_id: userId } : customer_id ? { customer_id: parseInt(customer_id) } : { session_id: session_id };
    const wishlistItems = await prisma.ecommerce_wishlist.findMany({
      where,
      include: {
        product: {
          include: {
            product_category: true,
            book_publisher: true,
            product_currency: true,
            product_stock: {
              where: { quantity: { gt: 0 } },
              include: {
                company: {
                  select: {
                    id: true,
                    company_name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });

    const formattedItems = wishlistItems.map((item) => ({
      id: item.id,
      product: {
        ...item.product,
        imageUrl: item.product.imageName ? `${HOST}/v1/product-image/${item.product.imageName}` : null,
        available_quantity: item.product.product_stock.reduce((sum, s) => sum + s.quantity, 0),
        stocks: item.product.product_stock.map((s) => ({
          company_id: s.company_id,
          company_name: s.company.company_name,
          quantity: s.quantity,
        })),
      },
      created_at: item.created_at,
    }));

    res.json(formattedItems);
  } catch (error) {
    console.error("Get wishlist error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Remove from wishlist
const removeFromWishlist = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.ecommerceUser?.id;
    const { customer_id, session_id } = req.query;

    const wishlistItem = await prisma.ecommerce_wishlist.findUnique({
      where: { id: parseInt(id) },
    });

    if (!wishlistItem) {
      return res.status(404).json({ message: "Wishlist item not found" });
    }

    // Verify ownership: customer_id (e-commerce user id) or session_id
    if (userId && wishlistItem.customer_id !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    if (!userId && customer_id && wishlistItem.customer_id !== parseInt(customer_id)) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    if (!userId && session_id && wishlistItem.session_id !== session_id) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    if (!userId && !customer_id && !session_id) {
      return res.status(400).json({ message: "Authentication or customer_id or session_id is required" });
    }

    await prisma.ecommerce_wishlist.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Item removed from wishlist" });
  } catch (error) {
    console.error("Remove from wishlist error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Add to cart
const addToCart = async (req, res) => {
  try {
    const { product_id, quantity = 1, customer_id, session_id } = req.body;
    const userId = req.ecommerceUser?.id;

    if (!product_id) {
      return res.status(400).json({ message: "Product ID is required" });
    }

    const finalSessionId = session_id || uuidv4();
    const useUserId = !!userId;
    if (!useUserId && !customer_id && !session_id) {
      return res.status(400).json({ message: "Authentication or session_id is required" });
    }

    const product = await prisma.product.findUnique({
      where: { id: parseInt(product_id) },
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const existingWhere = {
      product_id: parseInt(product_id),
      ...(useUserId ? { customer_id: userId } : customer_id ? { customer_id: parseInt(customer_id) } : { session_id: finalSessionId }),
    };
    const existing = await prisma.ecommerce_cart.findFirst({
      where: existingWhere,
    });

    let cartItem;
    if (existing) {
      cartItem = await prisma.ecommerce_cart.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + parseInt(quantity),
        },
        include: {
          product: {
            include: {
              product_category: true,
              book_publisher: true,
              product_currency: true,
            },
          },
        },
      });
    } else {
      const createData = {
        product_id: parseInt(product_id),
        quantity: parseInt(quantity),
        ...(useUserId ? { customer_id: userId, session_id: null } : customer_id ? { customer_id: parseInt(customer_id), session_id: null } : { session_id: finalSessionId, customer_id: null }),
      };
      cartItem = await prisma.ecommerce_cart.create({
        data: createData,
        include: {
          product: {
            include: {
              product_category: true,
              book_publisher: true,
              product_currency: true,
            },
          },
        },
      });
    }

    res.json({
      ...cartItem,
      product: {
        ...cartItem.product,
        imageUrl: cartItem.product.imageName
          ? `${HOST}/v1/product-image/${cartItem.product.imageName}`
          : null,
      },
      session_id: finalSessionId,
    });
  } catch (error) {
    console.error("Add to cart error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get cart
const getCart = async (req, res) => {
  try {
    const userId = req.ecommerceUser?.id;
    const { customer_id, session_id } = req.query;

    if (!userId && !customer_id && !session_id) {
      return res.status(400).json({ message: "Authentication or customer_id or session_id is required" });
    }

    const where = userId ? { customer_id: userId } : customer_id ? { customer_id: parseInt(customer_id) } : { session_id: session_id };
    const cartItems = await prisma.ecommerce_cart.findMany({
      where,
      include: {
        product: {
          include: {
            product_category: true,
            book_publisher: true,
            product_currency: true,
            product_stock: {
              where: { quantity: { gt: 0 } },
              include: {
                company: {
                  select: {
                    id: true,
                    company_name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });

    const formattedItems = cartItems.map((item) => ({
      id: item.id,
      product: {
        ...item.product,
        imageUrl: item.product.imageName ? `${HOST}/v1/product-image/${item.product.imageName}` : null,
        available_quantity: item.product.product_stock.reduce((sum, s) => sum + s.quantity, 0),
        stocks: item.product.product_stock.map((s) => ({
          company_id: s.company_id,
          company_name: s.company.company_name,
          quantity: s.quantity,
        })),
      },
      quantity: item.quantity,
      subtotal: item.product.sale_price * item.quantity,
      created_at: item.created_at,
    }));

    const total = formattedItems.reduce((sum, item) => sum + item.subtotal, 0);

    res.json({
      items: formattedItems,
      total: total,
      item_count: formattedItems.length,
    });
  } catch (error) {
    console.error("Get cart error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Update cart item
const updateCartItem = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.ecommerceUser?.id;
    const { quantity, customer_id, session_id } = req.body;

    const cartItem = await prisma.ecommerce_cart.findUnique({
      where: { id: parseInt(id) },
    });

    if (!cartItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    if (userId && cartItem.customer_id !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    if (!userId && customer_id && cartItem.customer_id !== parseInt(customer_id)) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    if (!userId && session_id && cartItem.session_id !== session_id) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    if (!userId && !customer_id && !session_id) {
      return res.status(400).json({ message: "Authentication or customer_id or session_id is required" });
    }

    if (parseInt(quantity) <= 0) {
      // Remove item if quantity is 0 or less
      await prisma.ecommerce_cart.delete({
        where: { id: parseInt(id) },
      });
      return res.json({ message: "Item removed from cart" });
    }

    const updatedItem = await prisma.ecommerce_cart.update({
      where: { id: parseInt(id) },
      data: {
        quantity: parseInt(quantity),
      },
      include: {
        product: {
          include: {
            product_category: true,
            book_publisher: true,
            product_currency: true,
          },
        },
      },
    });

    res.json({
      ...updatedItem,
      product: {
        ...updatedItem.product,
        imageUrl: updatedItem.product.imageName
          ? `${HOST}/v1/product-image/${updatedItem.product.imageName}`
          : null,
      },
    });
  } catch (error) {
    console.error("Update cart item error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Remove from cart
const removeFromCart = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.ecommerceUser?.id;
    const { customer_id, session_id } = req.query;

    const cartItem = await prisma.ecommerce_cart.findUnique({
      where: { id: parseInt(id) },
    });

    if (!cartItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    if (userId && cartItem.customer_id !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    if (!userId && customer_id && cartItem.customer_id !== parseInt(customer_id)) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    if (!userId && session_id && cartItem.session_id !== session_id) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    if (!userId && !customer_id && !session_id) {
      return res.status(400).json({ message: "Authentication or customer_id or session_id is required" });
    }

    await prisma.ecommerce_cart.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Item removed from cart" });
  } catch (error) {
    console.error("Remove from cart error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Create order
const createOrder = async (req, res) => {
  try {
    const {
      customer_id,
      customer_name,
      customer_phone,
      customer_email,
      customer_address,
      company_id,
      cart_items,
      discount = 0,
      payment_method,
      shipping_address,
      note,
      session_id,
    } = req.body;

    if (!customer_name || !customer_phone || !customer_address) {
      return res.status(400).json({ message: "Customer name, phone, and address are required" });
    }

    if (!cart_items || cart_items.length === 0) {
      return res.status(400).json({ message: "Cart items are required" });
    }

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Calculate totals
    let totalAmount = 0;
    const orderItems = [];

    for (const item of cart_items) {
      const product = await prisma.product.findUnique({
        where: { id: parseInt(item.product_id) },
      });

      if (!product) {
        return res.status(404).json({ message: `Product ${item.product_id} not found` });
      }

      // Check stock if company_id is provided
      if (company_id) {
        const stock = await prisma.product_stock.findFirst({
          where: {
            product_id: parseInt(item.product_id),
            company_id: parseInt(company_id),
          },
        });

        if (!stock || stock.quantity < item.quantity) {
          return res.status(400).json({
            message: `Insufficient stock for product ${product.name}. Available: ${stock ? stock.quantity : 0}, Requested: ${item.quantity}`,
          });
        }
      }

      const itemTotal = product.sale_price * item.quantity;
      totalAmount += itemTotal;

      orderItems.push({
        product_id: parseInt(item.product_id),
        quantity: parseInt(item.quantity),
        sale_price: product.sale_price,
        discount: item.discount || 0,
        total_amount: itemTotal,
      });
    }

    const finalTotal = totalAmount - discount;
    const dueAmount = finalTotal; // For now, assume no payment upfront

    // Create order
    const order = await prisma.ecommerce_order.create({
      data: {
        order_number: orderNumber,
        customer_id: customer_id ? parseInt(customer_id) : null,
        customer_name,
        customer_phone,
        customer_email,
        customer_address,
        company_id: company_id ? parseInt(company_id) : null,
        total_amount: finalTotal,
        discount,
        paid_amount: 0,
        due_amount: dueAmount,
        status: "pending",
        payment_status: "pending",
        payment_method,
        shipping_address: shipping_address || customer_address,
        note,
        session_id: session_id || null,
        order_items: {
          create: orderItems,
        },
      },
      include: {
        order_items: {
          include: {
            product: {
              include: {
                product_category: true,
                book_publisher: true,
                product_currency: true,
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
    });

    // Update stock if company_id is provided
    if (company_id) {
      for (const item of orderItems) {
        await prisma.product_stock.updateMany({
          where: {
            product_id: item.product_id,
            company_id: parseInt(company_id),
          },
          data: {
            quantity: {
              decrement: item.quantity,
            },
          },
        });
      }
    }

    // Clear cart
    if (customer_id) {
      await prisma.ecommerce_cart.deleteMany({
        where: { customer_id: parseInt(customer_id) },
      });
    } else if (session_id) {
      await prisma.ecommerce_cart.deleteMany({
        where: { session_id: session_id },
      });
    }

    res.json(order);
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get orders
const getOrders = async (req, res) => {
  try {
    const { customer_id, session_id, order_number, status } = req.query;

    const where = {};
    if (customer_id) {
      where.customer_id = parseInt(customer_id);
    } else if (session_id) {
      where.session_id = session_id;
    }
    if (order_number) {
      where.order_number = order_number;
    }
    if (status) {
      where.status = status;
    }

    const orders = await prisma.ecommerce_order.findMany({
      where,
      include: {
        order_items: {
          include: {
            product: {
              include: {
                product_category: true,
                book_publisher: true,
                product_currency: true,
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
      orderBy: {
        created_at: "desc",
      },
    });

    const formattedOrders = orders.map((order) => ({
      ...order,
      order_items: order.order_items.map((item) => ({
        ...item,
        product: {
          ...item.product,
          imageUrl: item.product.imageName
            ? `${HOST}/v1/product-image/${item.product.imageName}`
            : null,
        },
      })),
    }));

    res.json(formattedOrders);
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get single order
const getOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { customer_id, session_id } = req.query;

    const where = { id: parseInt(id) };
    if (customer_id) {
      where.customer_id = parseInt(customer_id);
    } else if (session_id) {
      where.session_id = session_id;
    }

    const order = await prisma.ecommerce_order.findFirst({
      where,
      include: {
        order_items: {
          include: {
            product: {
              include: {
                product_category: true,
                book_publisher: true,
                product_currency: true,
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
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const formattedOrder = {
      ...order,
      order_items: order.order_items.map((item) => ({
        ...item,
        product: {
          ...item.product,
          imageUrl: item.product.imageName ? `${HOST}/v1/product-image/${item.product.imageName}` : null,
        },
      })),
    };

    res.json(formattedOrder);
  } catch (error) {
    console.error("Get order error:", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  optionalEcommerceAuth,
  ecommerceSignup,
  ecommerceLogin,
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
};
