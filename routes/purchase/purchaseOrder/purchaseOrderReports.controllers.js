const { getCompanyId } = require("../../../utils/company");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Get Pending Items Report
const getPurchaseOrderPendingItems = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const { supplier_id, start_date, end_date } = req.query;

    const where = {
      company_id: companyId,
    };

    if (supplier_id) {
      where.supplier_id = Number(supplier_id);
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

    const orders = await prisma.purchase_order.findMany({
      where,
      include: {
        supplier: {
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
        .filter(item => item.received_quantity < item.ordered_quantity)
        .map(item => ({
          order_id: order.id,
          order_number: order.order_number,
          order_date: order.order_date,
          supplier: order.supplier,
          product: item.product,
          ordered_quantity: item.ordered_quantity,
          received_quantity: item.received_quantity,
          pending_quantity: item.ordered_quantity - item.received_quantity,
          purchase_price: item.purchase_price,
          status: order.status,
        }))
    );

    res.json({ success: true, pendingItems });
  } catch (error) {
    console.error("Get pending items error:", error);
    res.status(400).json({ error: error.message });
  }
};

// Get Purchase Order Completion Report
const getPurchaseOrderCompletionReport = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const { supplier_id, start_date, end_date } = req.query;

    const where = {
      company_id: companyId,
    };

    if (supplier_id) {
      where.supplier_id = Number(supplier_id);
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

    const orders = await prisma.purchase_order.findMany({
      where,
      include: {
        supplier: {
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
      const totalReceived = order.order_items.reduce(
        (sum, item) => sum + item.received_quantity,
        0
      );
      const completionPercentage =
        totalOrdered > 0 ? (totalReceived / totalOrdered) * 100 : 0;

      return {
        order_id: order.id,
        order_number: order.order_number,
        order_date: order.order_date,
        supplier: order.supplier,
        status: order.status,
        total_amount: order.total_amount,
        total_ordered: totalOrdered,
        total_received: totalReceived,
        completion_percentage: parseFloat(completionPercentage.toFixed(2)),
        pending_quantity: totalOrdered - totalReceived,
      };
    });

    res.json({ success: true, completionReport });
  } catch (error) {
    console.error("Get completion report error:", error);
    res.status(400).json({ error: error.message });
  }
};

// Get Purchase Order Status Summary
const getPurchaseOrderStatusSummary = async (req, res) => {
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

    const [pending, partial, received, cancelled] = await Promise.all([
      prisma.purchase_order.count({
        where: { ...where, status: "pending" },
      }),
      prisma.purchase_order.count({
        where: { ...where, status: "partial" },
      }),
      prisma.purchase_order.count({
        where: { ...where, status: "received" },
      }),
      prisma.purchase_order.count({
        where: { ...where, status: "cancelled" },
      }),
    ]);

    const total = pending + partial + received + cancelled;

    res.json({
      success: true,
      summary: {
        pending,
        partial,
        received,
        cancelled,
        total,
      },
    });
  } catch (error) {
    console.error("Get status summary error:", error);
    res.status(400).json({ error: error.message });
  }
};

// Get Supplier Order History
const getSupplierOrderHistory = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const { supplier_id } = req.params;
    const { start_date, end_date } = req.query;

    const where = {
      company_id: companyId,
      supplier_id: Number(supplier_id),
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

    const orders = await prisma.purchase_order.findMany({
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
      const totalReceived = order.order_items.reduce(
        (sum, item) => sum + item.received_quantity,
        0
      );
      const completionPercentage =
        totalOrdered > 0 ? (totalReceived / totalOrdered) * 100 : 0;

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
    console.error("Get supplier order history error:", error);
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  getPurchaseOrderPendingItems,
  getPurchaseOrderCompletionReport,
  getPurchaseOrderStatusSummary,
  getSupplierOrderHistory,
};
