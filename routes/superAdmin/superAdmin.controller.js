const prisma = require("../../utils/prisma");
const bcrypt = require("bcrypt");
const saltRounds = 10;

// ============================================
// USER MANAGEMENT
// ============================================

// Get all users (across all companies)
const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        company: {
          select: {
            id: true,
            company_name: true,
            status: true,
          },
        },
        designation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Remove password from response
    const usersWithoutPassword = users.map(({ password, ...user }) => user);
    res.json(usersWithoutPassword);
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get single user
const getSingleUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: {
        company: true,
        designation: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error("Get single user error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Create user
const createUser = async (req, res) => {
  try {
    const {
      username,
      password,
      email,
      role,
      company_id,
      phone,
      address,
      designation_id,
      salary,
      department,
      id_no,
      blood_group,
      join_date,
      status = true,
    } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ message: "Username, password, and role are required" });
    }

    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return res.status(400).json({ message: "Username already exists" });
    }

    // Hash password
    const hash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        password: hash,
        email: email || null,
        role,
        company_id: company_id || null,
        phone: phone || null,
        address: address || null,
        designation_id: designation_id || null,
        salary: salary || null,
        department: department || null,
        id_no: id_no || null,
        blood_group: blood_group || null,
        join_date: join_date ? new Date(join_date) : null,
        status,
        is_super_admin: false, // Only super admin can create users, but they can't create other super admins
      },
      include: {
        company: true,
        designation: true,
      },
    });

    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Update user
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      username,
      password,
      email,
      role,
      company_id,
      phone,
      address,
      designation_id,
      salary,
      department,
      id_no,
      blood_group,
      join_date,
      leave_date,
      status,
    } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Don't allow updating super admin status through this endpoint
    if (existingUser.is_super_admin) {
      return res.status(403).json({ message: "Cannot modify super admin user" });
    }

    // Prepare update data
    const updateData = {};
    if (username !== undefined) updateData.username = username;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (company_id !== undefined) updateData.company_id = company_id;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (designation_id !== undefined) updateData.designation_id = designation_id;
    if (salary !== undefined) updateData.salary = salary;
    if (department !== undefined) updateData.department = department;
    if (id_no !== undefined) updateData.id_no = id_no;
    if (blood_group !== undefined) updateData.blood_group = blood_group;
    if (join_date !== undefined) updateData.join_date = join_date ? new Date(join_date) : null;
    if (leave_date !== undefined) updateData.leave_date = leave_date ? new Date(leave_date) : null;
    if (status !== undefined) updateData.status = status;

    // Update password if provided
    if (password) {
      const hash = await bcrypt.hash(password, saltRounds);
      updateData.password = hash;
    }

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        company: true,
        designation: true,
      },
    });

    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Delete/Deactivate user
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (existingUser.is_super_admin) {
      return res.status(403).json({ message: "Cannot deactivate super admin user" });
    }

    await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        status: status !== undefined ? status : false,
      },
    });

    res.json({ message: "User status updated successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// COMPANY MANAGEMENT
// ============================================

// Get all companies
const getAllCompanies = async (req, res) => {
  try {
    const companies = await prisma.appSetting.findMany({
      include: {
        _count: {
          select: {
            users: true,
            customers: true,
            suppliers: true,
            saleInvoices: true,
            purchaseInvoices: true,
          },
        },
      },
      orderBy: {
        company_name: "asc",
      },
    });

    res.json(companies);
  } catch (error) {
    console.error("Get all companies error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get single company
const getSingleCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await prisma.appSetting.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: {
          select: {
            users: true,
            customers: true,
            suppliers: true,
            saleInvoices: true,
            purchaseInvoices: true,
          },
        },
      },
    });

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    res.json(company);
  } catch (error) {
    console.error("Get single company error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Create company
const createCompany = async (req, res) => {
  try {
    const {
      company_name,
      tag_line,
      address,
      phone,
      email,
      website,
      bank_name,
      account_name,
      account_number,
      ifsc,
      terms,
      logo,
      sale_invoice_prefix,
      quotation_prefix,
      challan_prefix,
      sale_invoice_terms,
      quotation_terms,
      challan_terms,
      status = true,
    } = req.body;

    if (!company_name || !address || !phone) {
      return res.status(400).json({ message: "Company name, address, and phone are required" });
    }

    const company = await prisma.appSetting.create({
      data: {
        company_name,
        tag_line: tag_line || null,
        address,
        phone,
        email: email || null,
        website: website || null,
        bank_name: bank_name || null,
        account_name: account_name || null,
        account_number: account_number || null,
        ifsc: ifsc || null,
        terms: terms || null,
        logo: logo || null,
        sale_invoice_prefix: sale_invoice_prefix || null,
        quotation_prefix: quotation_prefix || null,
        challan_prefix: challan_prefix || null,
        sale_invoice_terms: sale_invoice_terms || null,
        quotation_terms: quotation_terms || null,
        challan_terms: challan_terms || null,
        status,
      },
    });

    res.status(201).json(company);
  } catch (error) {
    console.error("Create company error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Update company
const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove id from updateData if present
    delete updateData.id;

    const company = await prisma.appSetting.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    res.json(company);
  } catch (error) {
    console.error("Update company error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Company not found" });
    }
    res.status(500).json({ message: error.message });
  }
};

// Delete/Deactivate company
const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await prisma.appSetting.update({
      where: { id: parseInt(id) },
      data: {
        status: status !== undefined ? status : false,
      },
    });

    res.json({ message: "Company status updated successfully" });
  } catch (error) {
    console.error("Delete company error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Company not found" });
    }
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// COMPANY DATA VIEWING
// ============================================

// Get company stock
const getCompanyStock = async (req, res) => {
  try {
    const { companyId } = req.params;
    const stock = await prisma.product_stock.findMany({
      where: {
        company_id: parseInt(companyId),
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
      orderBy: {
        product: {
          name: "asc",
        },
      },
    });

    res.json(stock);
  } catch (error) {
    console.error("Get company stock error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get company sales
const getCompanySales = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { startDate, endDate } = req.query;

    const where = {
      company_id: parseInt(companyId),
    };

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const sales = await prisma.saleInvoice.findMany({
      where,
      include: {
        customer: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        saleInvoiceProduct: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        date: "desc",
      },
    });

    res.json(sales);
  } catch (error) {
    console.error("Get company sales error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get company purchases
const getCompanyPurchases = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { startDate, endDate } = req.query;

    const where = {
      company_id: parseInt(companyId),
    };

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const purchases = await prisma.purchaseInvoice.findMany({
      where,
      include: {
        supplier: true,
        purchaseInvoiceProduct: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        date: "desc",
      },
    });

    res.json(purchases);
  } catch (error) {
    console.error("Get company purchases error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get company customers
const getCompanyCustomers = async (req, res) => {
  try {
    const { companyId } = req.params;
    const customers = await prisma.customer.findMany({
      where: {
        company_id: parseInt(companyId),
      },
      include: {
        _count: {
          select: {
            saleInvoice: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    res.json(customers);
  } catch (error) {
    console.error("Get company customers error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get company suppliers
const getCompanySuppliers = async (req, res) => {
  try {
    const { companyId } = req.params;
    const suppliers = await prisma.supplier.findMany({
      where: {
        company_id: parseInt(companyId),
      },
      include: {
        _count: {
          select: {
            purchaseInvoice: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    res.json(suppliers);
  } catch (error) {
    console.error("Get company suppliers error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get company dashboard data
const getCompanyDashboard = async (req, res) => {
  try {
    const { companyId } = req.params;

    const [
      totalCustomers,
      totalSuppliers,
      totalSales,
      totalPurchases,
      totalStockValue,
      recentSales,
      recentPurchases,
    ] = await Promise.all([
      prisma.customer.count({
        where: { company_id: parseInt(companyId), status: true },
      }),
      prisma.supplier.count({
        where: { company_id: parseInt(companyId), status: true },
      }),
      prisma.saleInvoice.aggregate({
        where: { company_id: parseInt(companyId) },
        _sum: { total_amount: true },
      }),
      prisma.purchaseInvoice.aggregate({
        where: { company_id: parseInt(companyId) },
        _sum: { total_amount: true },
      }),
      prisma.product_stock.findMany({
        where: { company_id: parseInt(companyId) },
        include: {
          product: true,
        },
      }),
      prisma.saleInvoice.findMany({
        where: { company_id: parseInt(companyId) },
        take: 5,
        orderBy: { date: "desc" },
        include: {
          customer: true,
        },
      }),
      prisma.purchaseInvoice.findMany({
        where: { company_id: parseInt(companyId) },
        take: 5,
        orderBy: { date: "desc" },
        include: {
          supplier: true,
        },
      }),
    ]);

    // Calculate total stock value
    const stockValue = totalStockValue.reduce((sum, stock) => {
      return sum + (stock.quantity * (stock.product.purchase_price || 0));
    }, 0);

    res.json({
      totalCustomers,
      totalSuppliers,
      totalSales: totalSales._sum.total_amount || 0,
      totalPurchases: totalPurchases._sum.total_amount || 0,
      totalStockValue: stockValue,
      recentSales,
      recentPurchases,
    });
  } catch (error) {
    console.error("Get company dashboard error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// MASTER DATA MANAGEMENT
// ============================================

// Product management
const getAllProducts = async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        product_category: true,
        book_publisher: true,
        product_currency: true,
        product_stock: {
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
      orderBy: {
        name: "asc",
      },
    });

    res.json(products);
  } catch (error) {
    console.error("Get all products error:", error);
    res.status(500).json({ message: error.message });
  }
};

const createProduct = async (req, res) => {
  try {
    const product = await prisma.product.create({
      data: req.body,
      include: {
        product_category: true,
        book_publisher: true,
        product_currency: true,
      },
    });

    res.status(201).json(product);
  } catch (error) {
    console.error("Create product error:", error);
    res.status(500).json({ message: error.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.update({
      where: { id: parseInt(id) },
      data: req.body,
      include: {
        product_category: true,
        book_publisher: true,
        product_currency: true,
      },
    });

    res.json(product);
  } catch (error) {
    console.error("Update product error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(500).json({ message: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.product.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Delete product error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(500).json({ message: error.message });
  }
};

// Book Publisher management
const getAllBookPublishers = async (req, res) => {
  try {
    const publishers = await prisma.book_publisher.findMany({
      include: {
        company: {
          select: {
            id: true,
            company_name: true,
          },
        },
        _count: {
          select: {
            product: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    res.json(publishers);
  } catch (error) {
    console.error("Get all book publishers error:", error);
    res.status(500).json({ message: error.message });
  }
};

const createBookPublisher = async (req, res) => {
  try {
    const publisher = await prisma.book_publisher.create({
      data: req.body,
      include: {
        company: true,
      },
    });

    res.status(201).json(publisher);
  } catch (error) {
    console.error("Create book publisher error:", error);
    res.status(500).json({ message: error.message });
  }
};

const updateBookPublisher = async (req, res) => {
  try {
    const { id } = req.params;
    const publisher = await prisma.book_publisher.update({
      where: { id: parseInt(id) },
      data: req.body,
      include: {
        company: true,
      },
    });

    res.json(publisher);
  } catch (error) {
    console.error("Update book publisher error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Book publisher not found" });
    }
    res.status(500).json({ message: error.message });
  }
};

const deleteBookPublisher = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.book_publisher.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Book publisher deleted successfully" });
  } catch (error) {
    console.error("Delete book publisher error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Book publisher not found" });
    }
    res.status(500).json({ message: error.message });
  }
};

// Product Category management
const getAllProductCategories = async (req, res) => {
  try {
    const categories = await prisma.product_category.findMany({
      include: {
        company: {
          select: {
            id: true,
            company_name: true,
          },
        },
        _count: {
          select: {
            product: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    res.json(categories);
  } catch (error) {
    console.error("Get all product categories error:", error);
    res.status(500).json({ message: error.message });
  }
};

const createProductCategory = async (req, res) => {
  try {
    const category = await prisma.product_category.create({
      data: req.body,
      include: {
        company: true,
      },
    });

    res.status(201).json(category);
  } catch (error) {
    console.error("Create product category error:", error);
    res.status(500).json({ message: error.message });
  }
};

const updateProductCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await prisma.product_category.update({
      where: { id: parseInt(id) },
      data: req.body,
      include: {
        company: true,
      },
    });

    res.json(category);
  } catch (error) {
    console.error("Update product category error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Product category not found" });
    }
    res.status(500).json({ message: error.message });
  }
};

const deleteProductCategory = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.product_category.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Product category deleted successfully" });
  } catch (error) {
    console.error("Delete product category error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Product category not found" });
    }
    res.status(500).json({ message: error.message });
  }
};

// Product Currency management
const getAllProductCurrencies = async (req, res) => {
  try {
    const currencies = await prisma.product_currency.findMany({
      include: {
        company: {
          select: {
            id: true,
            company_name: true,
          },
        },
        currency_rates: {
          orderBy: {
            effective_from_date: "desc",
          },
          take: 1,
        },
        _count: {
          select: {
            product: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    res.json(currencies);
  } catch (error) {
    console.error("Get all product currencies error:", error);
    res.status(500).json({ message: error.message });
  }
};

const createProductCurrency = async (req, res) => {
  try {
    const currency = await prisma.product_currency.create({
      data: req.body,
      include: {
        company: true,
      },
    });

    res.status(201).json(currency);
  } catch (error) {
    console.error("Create product currency error:", error);
    res.status(500).json({ message: error.message });
  }
};

const updateProductCurrency = async (req, res) => {
  try {
    const { id } = req.params;
    const currency = await prisma.product_currency.update({
      where: { id: parseInt(id) },
      data: req.body,
      include: {
        company: true,
      },
    });

    res.json(currency);
  } catch (error) {
    console.error("Update product currency error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Product currency not found" });
    }
    res.status(500).json({ message: error.message });
  }
};

const deleteProductCurrency = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.product_currency.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Product currency deleted successfully" });
  } catch (error) {
    console.error("Delete product currency error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Product currency not found" });
    }
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
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
};
