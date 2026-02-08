const { getCompanyId } = require("../../../utils/company");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Get Pending Items Report
const getOrderPendingItems = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const { customer_id, start_date, end_date } = req.query;

    const where = {
      company_id: companyId,
    };

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

    const orders = await prisma.sales_order.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
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
      orderBy: { order_date: "desc" },
    });

    // Format response with pending quantities - filter items with pending quantity > 0
    const pendingItems = orders.flatMap(order =>
      order.order_items
        .filter(item => item.fulfilled_quantity < item.ordered_quantity)
        .map(item => ({
          order_id: order.id,
          order_number: order.order_number,
          order_date: order.order_date,
          customer: order.customer,
          product: item.product,
          ordered_quantity: item.ordered_quantity,
          fulfilled_quantity: item.fulfilled_quantity,
          pending_quantity: item.ordered_quantity - item.fulfilled_quantity,
          sale_price: item.sale_price,
          status: order.status,
        }))
    );

    res.json({ success: true, pendingItems });
  } catch (error) {
    console.error("Get pending items error:", error);
    res.status(400).json({ error: error.message });
  }
};

// Get Order Completion Report
const getOrderCompletionReport = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const { customer_id, start_date, end_date } = req.query;

    const where = {
      company_id: companyId,
    };

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

    const orders = await prisma.sales_order.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
        order_items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { order_date: "desc" },
    });

    const completionReport = orders.map(order => {
      const totalOrdered = order.order_items.reduce(
        (sum, item) => sum + item.ordered_quantity,
        0
      );
      const totalFulfilled = order.order_items.reduce(
        (sum, item) => sum + item.fulfilled_quantity,
        0
      );
      const completionPercentage =
        totalOrdered > 0 ? (totalFulfilled / totalOrdered) * 100 : 0;

      return {
        order_id: order.id,
        order_number: order.order_number,
        order_date: order.order_date,
        customer: order.customer,
        status: order.status,
        total_amount: order.total_amount,
        total_ordered: totalOrdered,
        total_fulfilled: totalFulfilled,
        completion_percentage: parseFloat(completionPercentage.toFixed(2)),
        pending_quantity: totalOrdered - totalFulfilled,
      };
    });

    res.json({ success: true, completionReport });
  } catch (error) {
    console.error("Get completion report error:", error);
    res.status(400).json({ error: error.message });
  }
};

// Get Order Status Summary
const getOrderStatusSummary = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const { start_date, end_date } = req.query;

    const where = {
      company_id: companyId,
    };

    if (start_date || end_date) {
      where.order_date = {};
      if (start_date) {
        where.order_date.gte = new Date(start_date);
      }
      if (end_date) {
        where.order_date.lte = new Date(end_date);
      }
    }

    const [pending, partial, fulfilled, cancelled] = await Promise.all([
      prisma.sales_order.count({
        where: { ...where, status: "pending" },
      }),
      prisma.sales_order.count({
        where: { ...where, status: "partial" },
      }),
      prisma.sales_order.count({
        where: { ...where, status: "fulfilled" },
      }),
      prisma.sales_order.count({
        where: { ...where, status: "cancelled" },
      }),
    ]);

    const total = pending + partial + fulfilled + cancelled;

    res.json({
      success: true,
      summary: {
        pending,
        partial,
        fulfilled,
        cancelled,
        total,
      },
    });
  } catch (error) {
    console.error("Get status summary error:", error);
    res.status(400).json({ error: error.message });
  }
};

// Get Customer Order History
const getCustomerOrderHistory = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const { customer_id } = req.params;
    const { start_date, end_date } = req.query;

    const where = {
      company_id: companyId,
      customer_id: Number(customer_id),
    };

    if (start_date || end_date) {
      where.order_date = {};
      if (start_date) {
        where.order_date.gte = new Date(start_date);
      }
      if (end_date) {
        where.order_date.lte = new Date(end_date);
      }
    }

    const orders = await prisma.sales_order.findMany({
      where,
      include: {
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
      orderBy: { order_date: "desc" },
    });

    const history = orders.map(order => {
      const totalOrdered = order.order_items.reduce(
        (sum, item) => sum + item.ordered_quantity,
        0
      );
      const totalFulfilled = order.order_items.reduce(
        (sum, item) => sum + item.fulfilled_quantity,
        0
      );
      const completionPercentage =
        totalOrdered > 0 ? (totalFulfilled / totalOrdered) * 100 : 0;

      return {
        order_id: order.id,
        order_number: order.order_number,
        order_date: order.order_date,
        status: order.status,
        total_amount: order.total_amount,
        completion_percentage: parseFloat(completionPercentage.toFixed(2)),
        items: order.order_items.length,
      };
    });

    res.json({ success: true, history });
  } catch (error) {
    console.error("Get customer order history error:", error);
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  getOrderPendingItems,
  getOrderCompletionReport,
  getOrderStatusSummary,
  getCustomerOrderHistory,
};
