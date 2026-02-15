const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const prisma = require("../../../utils/prisma");

// Helper function to calculate order status
const calculateOrderStatus = (items) => {
  if (!items || items.length === 0) return "pending";
  
  const allFulfilled = items.every(item => item.fulfilled_quantity >= item.ordered_quantity);
  const allPending = items.every(item => item.fulfilled_quantity === 0);
  
  if (allFulfilled) return "fulfilled";
  if (allPending) return "pending";
  return "partial";
};

// Create Sales Order
const createSalesOrder = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const { order_number, order_date, customer_id, user_id, discount = 0, note, order_items } = req.body;

    if (!order_items || order_items.length === 0) {
      return res.status(400).json({ error: "Order items are required" });
    }

    // Step 1: Handle new products (products with ISBN but no product_id)
    const productIdMap = new Map(); // Map ISBN to product_id
    const newProducts = order_items.filter(item => item.isbn && !item.product_id);
    
    // Create new products if any
    for (const item of newProducts) {
      if (!item.isbn) continue;
      
      // Check if product already exists by ISBN
      let existingProduct = await prisma.product.findUnique({
        where: { isbn: item.isbn }
      });
      
      if (existingProduct) {
        productIdMap.set(item.isbn, existingProduct.id);
        continue;
      }
      
      // Get default currency
      const defaultCurrency = await prisma.product_currency.findFirst({
        where: { company_id: companyId }
      });
      
      if (!defaultCurrency) {
        return res.status(400).json({ error: "No currency found. Please create a currency first." });
      }
      
      // Create the new product
      const newProductData = {
        isbn: item.isbn,
        name: item.name || item.product_name || "",
        author: item.author || null,
        sale_price: parseFloat(item.sale_price) || 0,
        purchase_price: parseFloat(item.purchase_price) || 0,
        unit_measurement: parseFloat(item.unit_measurement) || 0,
        unit_type: item.unit_type || "",
        product_currency: {
          connect: { id: defaultCurrency.id }
        }
      };
      
      // Connect publisher if available
      if (item.book_publisher_id) {
        newProductData.book_publisher = {
          connect: { id: Number(item.book_publisher_id) }
        };
      }
      
      // Connect category if available
      if (item.product_category_id) {
        newProductData.product_category = {
          connect: { id: Number(item.product_category_id) }
        };
      }
      
      const createdProduct = await prisma.product.create({
        data: newProductData
      });
      
      // Create product_stock entry with 0 quantity
      await prisma.product_stock.upsert({
        where: {
          product_id_company_id: {
            product_id: createdProduct.id,
            company_id: companyId,
          },
        },
        update: {},
        create: {
          product_id: createdProduct.id,
          company_id: companyId,
          quantity: 0,
        },
      });
      
      productIdMap.set(item.isbn, createdProduct.id);
    }
    
    // Step 2: Verify products with product_id exist
    const productIds = order_items
      .filter(item => item.product_id)
      .map(item => Number(item.product_id));
    
    if (productIds.length > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true },
      });

      if (products.length !== productIds.length) {
        return res.status(404).json({ error: "Some products not found" });
      }
    }

    // Step 3: Map all products to their IDs and calculate totals
    // Bill discount is a percentage that applies to all items after product discount
    const billDiscountPercent = parseFloat(discount || 0);
    let totalAmount = 0;
    const processedItems = order_items.map(item => {
      let finalProductId;
      
      if (item.product_id) {
        finalProductId = Number(item.product_id);
      } else if (item.isbn && productIdMap.has(item.isbn)) {
        finalProductId = productIdMap.get(item.isbn);
      } else {
        throw new Error(`Product not found for ISBN: ${item.isbn || 'N/A'}`);
      }
      
      const itemTotal = parseFloat(item.sale_price) * parseFloat(item.ordered_quantity);
      const itemDiscount = (itemTotal * parseFloat(item.discount || 0)) / 100;
      const itemAfterProductDiscount = itemTotal - itemDiscount;
      const billDiscountAmount = (itemAfterProductDiscount * billDiscountPercent) / 100;
      const itemAmount = itemAfterProductDiscount - billDiscountAmount;
      totalAmount += itemAmount;
      
      return {
        product_id: finalProductId,
        ordered_quantity: Number(item.ordered_quantity),
        fulfilled_quantity: 0,
        sale_price: parseFloat(item.sale_price),
        discount: parseFloat(item.discount || 0),
        total_amount: itemAmount,
      };
    });

    const finalTotal = totalAmount;

    // Generate order number if not provided
    let orderNumber = order_number;
    if (!orderNumber) {
      const count = await prisma.sales_order.count({
        where: { company_id: companyId },
      });
      orderNumber = `SO-${Date.now()}-${count + 1}`;
    }

    // Check if order number already exists
    const existingOrder = await prisma.sales_order.findUnique({
      where: { order_number: orderNumber },
    });

    if (existingOrder) {
      return res.status(400).json({ error: "Order number already exists" });
    }

    const createdOrder = await prisma.sales_order.create({
      data: {
        order_number: orderNumber,
        order_date: new Date(order_date),
        customer_id: Number(customer_id),
        company_id: companyId,
        user_id: Number(user_id),
        total_amount: finalTotal,
        discount: parseFloat(discount || 0),
        note: note || null,
        status: "pending",
        order_items: {
          create: processedItems,
        },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
          },
        },
        order_items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                isbn: true,
                sale_price: true,
              },
            },
          },
        },
      },
    });

    res.json({ success: true, order: createdOrder });
  } catch (error) {
    console.error("Create sales order error:", error);
    res.status(400).json({ error: error.message });
  }
};

// Get All Sales Orders
const getAllSalesOrders = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const { page = 1, limit = 20, status, customer_id, start_date, end_date } = req.query;
    const { skip, take } = getPagination(page, limit);

    const where = {
      company_id: companyId,
    };

    if (status) {
      where.status = status;
    }

    if (customer_id) {
      where.customer_id = Number(customer_id);
    }

    if (start_date || end_date) {
      where.order_date = {};
      if (start_date) {
        where.order_date.gte = new Date(start_date);
      }
      if (end_date) {
        where.order_date.lte = new Date(end_date);
      }
    }

    const [orders, total] = await Promise.all([
      prisma.sales_order.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: "desc" },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
          user: {
            select: {
              id: true,
              username: true,
            },
          },
          order_items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  isbn: true,
                },
              },
            },
          },
        },
      }),
      prisma.sales_order.count({ where }),
    ]);

    res.json({
      success: true,
      orders,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get all sales orders error:", error);
    res.status(400).json({ error: error.message });
  }
};

// Get Sales Order by ID
const getSalesOrderById = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const { id } = req.params;

    const order = await prisma.sales_order.findFirst({
      where: {
        id: Number(id),
        company_id: companyId,
      },
      include: {
        customer: true,
        user: {
          select: {
            id: true,
            username: true,
          },
        },
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
        purchaseInvoices: {
          select: {
            id: true,
            date: true,
            total_amount: true,
            supplier_memo_no: true,
          },
        },
        saleInvoices: {
          select: {
            id: true,
            invoice_number: true,
            date: true,
            total_amount: true,
            prefix: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Sales order not found" });
    }

    res.json({ success: true, order });
  } catch (error) {
    console.error("Get sales order by ID error:", error);
    res.status(400).json({ error: error.message });
  }
};

// Update Sales Order
const updateSalesOrder = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const { id } = req.params;
    const { order_date, customer_id, user_id, discount, note, order_items } = req.body;

    // Check if order exists and belongs to company
    const existingOrder = await prisma.sales_order.findFirst({
      where: {
        id: Number(id),
        company_id: companyId,
      },
      include: {
        order_items: true,
      },
    });

    if (!existingOrder) {
      return res.status(404).json({ error: "Sales order not found" });
    }

    // Don't allow update if order is fulfilled or cancelled
    if (existingOrder.status === "fulfilled" || existingOrder.status === "cancelled") {
      return res.status(400).json({ error: "Cannot update fulfilled or cancelled order" });
    }

    let updateData = {};
    if (order_date) updateData.order_date = new Date(order_date);
    if (customer_id) updateData.customer_id = Number(customer_id);
    if (user_id) updateData.user_id = Number(user_id);
    if (discount !== undefined) updateData.discount = parseFloat(discount);
    if (note !== undefined) updateData.note = note;

    // If order_items are provided, recalculate total
    if (order_items && order_items.length > 0) {
      // Step 1: Handle new products (products with ISBN but no product_id)
      const productIdMap = new Map();
      const newProducts = order_items.filter(item => item.isbn && !item.product_id);
      
      // Create new products if any
      for (const item of newProducts) {
        if (!item.isbn) continue;
        
        let existingProduct = await prisma.product.findUnique({
          where: { isbn: item.isbn }
        });
        
        if (existingProduct) {
          productIdMap.set(item.isbn, existingProduct.id);
          continue;
        }
        
        const defaultCurrency = await prisma.product_currency.findFirst({
          where: { company_id: companyId }
        });
        
        if (!defaultCurrency) {
          return res.status(400).json({ error: "No currency found. Please create a currency first." });
        }
        
        const newProductData = {
          isbn: item.isbn,
          name: item.name || item.product_name || "",
          author: item.author || null,
          sale_price: parseFloat(item.sale_price) || 0,
          purchase_price: parseFloat(item.purchase_price) || 0,
          unit_measurement: parseFloat(item.unit_measurement) || 0,
          unit_type: item.unit_type || "",
          product_currency: {
            connect: { id: defaultCurrency.id }
          }
        };
        
        if (item.book_publisher_id) {
          newProductData.book_publisher = {
            connect: { id: Number(item.book_publisher_id) }
          };
        }
        
        if (item.product_category_id) {
          newProductData.product_category = {
            connect: { id: Number(item.product_category_id) }
          };
        }
        
        const createdProduct = await prisma.product.create({
          data: newProductData
        });
        
        await prisma.product_stock.upsert({
          where: {
            product_id_company_id: {
              product_id: createdProduct.id,
              company_id: companyId,
            },
          },
          update: {},
          create: {
            product_id: createdProduct.id,
            company_id: companyId,
            quantity: 0,
          },
        });
        
        productIdMap.set(item.isbn, createdProduct.id);
      }
      
      // Step 2: Verify products with product_id exist
      const productIds = order_items
        .filter(item => item.product_id)
        .map(item => Number(item.product_id));
      
      if (productIds.length > 0) {
        const products = await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true },
        });

        if (products.length !== productIds.length) {
          return res.status(404).json({ error: "Some products not found" });
        }
      }

      // Step 3: Map all products to their IDs and calculate totals
      // Bill discount is a percentage that applies to all items after product discount
      const billDiscountPercent = parseFloat(updateData.discount !== undefined ? updateData.discount : (existingOrder.discount || 0));
      let totalAmount = 0;
      const processedItems = order_items.map(item => {
        let finalProductId;
        
        if (item.product_id) {
          finalProductId = Number(item.product_id);
        } else if (item.isbn && productIdMap.has(item.isbn)) {
          finalProductId = productIdMap.get(item.isbn);
        } else {
          throw new Error(`Product not found for ISBN: ${item.isbn || 'N/A'}`);
        }
        
        const itemTotal = parseFloat(item.sale_price) * parseFloat(item.ordered_quantity);
        const itemDiscount = (itemTotal * parseFloat(item.discount || 0)) / 100;
        const itemAfterProductDiscount = itemTotal - itemDiscount;
        const billDiscountAmount = (itemAfterProductDiscount * billDiscountPercent) / 100;
        const itemAmount = itemAfterProductDiscount - billDiscountAmount;
        totalAmount += itemAmount;
        
        return {
          product_id: finalProductId,
          ordered_quantity: Number(item.ordered_quantity),
          fulfilled_quantity: item.fulfilled_quantity || 0,
          sale_price: parseFloat(item.sale_price),
          discount: parseFloat(item.discount || 0),
          total_amount: itemAmount,
        };
      });

      const finalTotal = totalAmount;
      updateData.total_amount = finalTotal;

      // Delete existing items and create new ones
      await prisma.sales_order_item.deleteMany({
        where: { order_id: Number(id) },
      });

      updateData.order_items = {
        create: processedItems,
      };
    }

    const updatedOrder = await prisma.sales_order.update({
      where: { id: Number(id) },
      data: updateData,
      include: {
        customer: true,
        user: {
          select: {
            id: true,
            username: true,
          },
        },
        order_items: {
          include: {
            product: true,
          },
        },
      },
    });

    // Recalculate status
    const orderWithItems = await prisma.sales_order.findUnique({
      where: { id: Number(id) },
      include: { order_items: true },
    });

    const newStatus = calculateOrderStatus(orderWithItems.order_items);
    if (newStatus !== updatedOrder.status) {
      await prisma.sales_order.update({
        where: { id: Number(id) },
        data: { status: newStatus },
      });
      updatedOrder.status = newStatus;
    }

    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error("Update sales order error:", error);
    res.status(400).json({ error: error.message });
  }
};

// Delete Sales Order
const deleteSalesOrder = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const { id } = req.params;

    const order = await prisma.sales_order.findFirst({
      where: {
        id: Number(id),
        company_id: companyId,
      },
      include: {
        purchaseInvoices: true,
        saleInvoices: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Sales order not found" });
    }

    // Don't allow delete if there are linked invoices
    if (order.purchaseInvoices.length > 0 || order.saleInvoices.length > 0) {
      return res.status(400).json({ 
        error: "Cannot delete order with linked purchase or sale invoices" 
      });
    }

    await prisma.sales_order.delete({
      where: { id: Number(id) },
    });

    res.json({ success: true, message: "Sales order deleted successfully" });
  } catch (error) {
    console.error("Delete sales order error:", error);
    res.status(400).json({ error: error.message });
  }
};

// Update Order Item Fulfillment
const updateOrderItemFulfillment = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const { id } = req.params;
    const { item_id, fulfilled_quantity } = req.body;

    const order = await prisma.sales_order.findFirst({
      where: {
        id: Number(id),
        company_id: companyId,
      },
      include: {
        order_items: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Sales order not found" });
    }

    const item = order.order_items.find(i => i.id === Number(item_id));
    if (!item) {
      return res.status(404).json({ error: "Order item not found" });
    }

    const newFulfilledQty = Math.min(
      Math.max(0, Number(fulfilled_quantity)),
      item.ordered_quantity
    );

    await prisma.sales_order_item.update({
      where: { id: Number(item_id) },
      data: { fulfilled_quantity: newFulfilledQty },
    });

    // Recalculate order status
    const updatedOrder = await prisma.sales_order.findUnique({
      where: { id: Number(id) },
      include: { order_items: true },
    });

    const newStatus = calculateOrderStatus(updatedOrder.order_items);
    await prisma.sales_order.update({
      where: { id: Number(id) },
      data: { status: newStatus },
    });

    res.json({ success: true, message: "Fulfillment updated successfully" });
  } catch (error) {
    console.error("Update fulfillment error:", error);
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  createSalesOrder,
  getAllSalesOrders,
  getSalesOrderById,
  updateSalesOrder,
  deleteSalesOrder,
  updateOrderItemFulfillment,
};
