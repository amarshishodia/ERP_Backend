const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const prisma = require("../../../utils/prisma");

const createSingleDiscountMaster = async (req, res) => {
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }

  if (req.query.query === "createmany" && Array.isArray(req.body)) {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }
    const companyIdNum = parseInt(companyId, 10);
    let created = 0;
    const errors = [];

    for (let i = 0; i < req.body.length; i++) {
      const row = req.body[i];
      try {
        const discount_type = row.discount_type;
        let publisher_id = row.publisher_id != null && row.publisher_id !== "" ? Number(row.publisher_id) : null;
        let customer_id = row.customer_id != null && row.customer_id !== "" ? Number(row.customer_id) : null;
        let supplier_id = row.supplier_id != null && row.supplier_id !== "" ? Number(row.supplier_id) : null;

        // Resolve names to IDs when IDs are not provided (for CSV upload with names instead of IDs)
        if (!publisher_id && (row.publisher_name || row.publisher)) {
          const name = String(row.publisher_name || row.publisher).trim();
          if (name) {
            const pub = await prisma.book_publisher.findFirst({
              where: { name, company_id: companyIdNum },
            });
            if (pub) publisher_id = pub.id;
          }
        }
        if (!customer_id && (row.customer_name || row.customer)) {
          const name = String(row.customer_name || row.customer).trim();
          if (name) {
            const cust = await prisma.customer.findFirst({
              where: { name, company_id: companyIdNum },
            });
            if (cust) customer_id = cust.id;
          }
        }
        if (!supplier_id && (row.supplier_name || row.supplier)) {
          const name = String(row.supplier_name || row.supplier).trim();
          if (name) {
            const sup = await prisma.supplier.findFirst({
              where: { name, company_id: companyIdNum },
            });
            if (sup) supplier_id = sup.id;
          }
        }
        const discount_value = parseFloat(row.discount_value);
        const discount_unit = row.discount_unit || "percentage";
        const status = row.status !== undefined ? Boolean(row.status) : true;
        const effective_from = row.effective_from ? new Date(row.effective_from) : null;
        const effective_to = row.effective_to ? new Date(row.effective_to) : null;
        const description = row.description || null;

        if (!["sale", "purchase"].includes(discount_type)) {
          errors.push({ row: i + 1, error: "Invalid discount_type" });
          continue;
        }
        if (!["percentage", "fixed"].includes(discount_unit)) {
          errors.push({ row: i + 1, error: "Invalid discount_unit" });
          continue;
        }
        if (!publisher_id) {
          errors.push({ row: i + 1, error: "Publisher is required" });
          continue;
        }
        const publisher = await prisma.book_publisher.findFirst({
          where: { id: Number(publisher_id), company_id: companyId },
        });
        if (!publisher) {
          errors.push({ row: i + 1, error: "Publisher not found" });
          continue;
        }
        if (discount_type === "sale" && !customer_id) {
          errors.push({ row: i + 1, error: "Customer is required for sale" });
          continue;
        }
        if (discount_type === "purchase" && !supplier_id) {
          errors.push({ row: i + 1, error: "Supplier is required for purchase" });
          continue;
        }
        if (discount_type === "sale" && customer_id) {
          const customer = await prisma.customer.findFirst({
            where: { id: Number(customer_id), company_id: companyId },
          });
          if (!customer) {
            errors.push({ row: i + 1, error: "Customer not found" });
            continue;
          }
        }
        if (discount_type === "purchase" && supplier_id) {
          const supplier = await prisma.supplier.findFirst({
            where: { id: Number(supplier_id), company_id: companyId },
          });
          if (!supplier) {
            errors.push({ row: i + 1, error: "Supplier not found" });
            continue;
          }
        }
        if (discount_unit === "percentage" && (isNaN(discount_value) || discount_value < 0 || discount_value > 100)) {
          errors.push({ row: i + 1, error: "Percentage must be 0-100" });
          continue;
        }
        if (discount_unit === "fixed" && (isNaN(discount_value) || discount_value < 0)) {
          errors.push({ row: i + 1, error: "Fixed discount must be >= 0" });
          continue;
        }

        await prisma.discount_master.create({
          data: {
            company_id: companyId,
            discount_type,
            publisher_id: Number(publisher_id),
            customer_id: customer_id ? Number(customer_id) : null,
            supplier_id: supplier_id ? Number(supplier_id) : null,
            discount_value,
            discount_unit,
            status,
            effective_from,
            effective_to,
            description,
          },
        });
        created++;
      } catch (err) {
        errors.push({ row: i + 1, error: err.message || "Failed" });
      }
    }
    return res.json({ created, total: req.body.length, errors: errors.length ? errors : undefined });
  }

  try {
    const {
      discount_type,
      publisher_id,
      customer_id,
      supplier_id,
      discount_value,
      discount_unit,
      status,
      effective_from,
      effective_to,
      description,
    } = req.body;

    // Validate discount_type
    if (!["sale", "purchase"].includes(discount_type)) {
      return res.status(400).json({ error: "Invalid discount_type. Must be 'sale' or 'purchase'" });
    }

    // Validate discount_unit
    if (!["percentage", "fixed"].includes(discount_unit)) {
      return res.status(400).json({ error: "Invalid discount_unit. Must be 'percentage' or 'fixed'" });
    }

    // Publisher is always required
    if (!publisher_id) {
      return res.status(400).json({ error: "Publisher is required" });
    }

    const publisher = await prisma.book_publisher.findFirst({
      where: { id: Number(publisher_id), company_id: companyId },
    });
    if (!publisher) {
      return res.status(400).json({ error: "Publisher not found" });
    }

    // Validate based on discount_type
    if (discount_type === "sale") {
      if (!customer_id) {
        return res.status(400).json({ error: "Customer is required for sale discounts" });
      }
      const customer = await prisma.customer.findFirst({
        where: { id: Number(customer_id), company_id: companyId },
      });
      if (!customer) {
        return res.status(400).json({ error: "Customer not found" });
      }
    } else if (discount_type === "purchase") {
      if (!supplier_id) {
        return res.status(400).json({ error: "Supplier is required for purchase discounts" });
      }
      const supplier = await prisma.supplier.findFirst({
        where: { id: Number(supplier_id), company_id: companyId },
      });
      if (!supplier) {
        return res.status(400).json({ error: "Supplier not found" });
      }
    }

    // Validate discount_value
    if (discount_unit === "percentage" && (discount_value < 0 || discount_value > 100)) {
      return res.status(400).json({ error: "Percentage discount must be between 0 and 100" });
    }
    if (discount_unit === "fixed" && discount_value < 0) {
      return res.status(400).json({ error: "Fixed discount must be greater than or equal to 0" });
    }

    const createdDiscount = await prisma.discount_master.create({
      data: {
        company_id: companyId,
        discount_type,
        publisher_id: Number(publisher_id),
        customer_id: customer_id ? Number(customer_id) : null,
        supplier_id: supplier_id ? Number(supplier_id) : null,
        discount_value: parseFloat(discount_value),
        discount_unit,
        status: status !== undefined ? Boolean(status) : true,
        effective_from: effective_from ? new Date(effective_from) : null,
        effective_to: effective_to ? new Date(effective_to) : null,
        description: description || null,
      },
      include: {
        publisher: {
          select: { id: true, name: true },
        },
        customer: {
          select: { id: true, name: true },
        },
        supplier: {
          select: { id: true, name: true },
        },
      },
    });

    res.json(createdDiscount);
  } catch (error) {
    res.status(400).json({ error: error.message });
    console.log(error.message);
  }
};

const getAllDiscountMaster = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }

  try {
    const { skip, limit } = getPagination(req.query);
    const discountType = req.query.discount_type; // Optional filter by type
    const status = req.query.status; // Optional filter by status

    const whereCondition = {
      company_id: companyId,
    };

    if (discountType) {
      whereCondition.discount_type = discountType;
    }

    if (status !== undefined) {
      whereCondition.status = status === "true";
    }

    const allDiscounts = await prisma.discount_master.findMany({
      where: whereCondition,
      include: {
        publisher: {
          select: { id: true, name: true },
        },
        customer: {
          select: { id: true, name: true },
        },
        supplier: {
          select: { id: true, name: true },
        },
      },
      orderBy: {
        id: "desc",
      },
      skip: parseInt(skip),
      take: parseInt(limit),
    });

    res.json(allDiscounts);
  } catch (error) {
    res.status(400).json({ error: error.message });
    console.log(error.message);
  }
};

const getSingleDiscountMaster = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const singleDiscount = await prisma.discount_master.findUnique({
      where: {
        id: Number(req.params.id),
      },
      include: {
        publisher: {
          select: { id: true, name: true },
        },
        customer: {
          select: { id: true, name: true },
        },
        supplier: {
          select: { id: true, name: true },
        },
      },
    });

    if (!singleDiscount) {
      return res.status(404).json({ error: "Discount master not found" });
    }

    // Verify that the discount belongs to the user's company
    if (singleDiscount.company_id !== companyId) {
      return res.status(403).json({ error: "Discount master does not belong to your company" });
    }

    res.json(singleDiscount);
  } catch (error) {
    res.status(400).json({ error: error.message });
    console.log(error.message);
  }
};

const updateSingleDiscountMaster = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // Verify that the discount belongs to the user's company
    const existingDiscount = await prisma.discount_master.findUnique({
      where: { id: Number(req.params.id) },
      select: { company_id: true },
    });

    if (!existingDiscount) {
      return res.status(404).json({ error: "Discount master not found" });
    }

    if (existingDiscount.company_id !== companyId) {
      return res.status(403).json({ error: "Discount master does not belong to your company" });
    }

    const {
      discount_type,
      publisher_id,
      customer_id,
      supplier_id,
      discount_value,
      discount_unit,
      status,
      effective_from,
      effective_to,
      description,
    } = req.body;

    // Validate discount_type if provided
    if (discount_type && !["sale", "purchase"].includes(discount_type)) {
      return res.status(400).json({ error: "Invalid discount_type. Must be 'sale' or 'purchase'" });
    }

    // Validate discount_unit if provided
    if (discount_unit && !["percentage", "fixed"].includes(discount_unit)) {
      return res.status(400).json({ error: "Invalid discount_unit. Must be 'percentage' or 'fixed'" });
    }

    // Get existing discount to check current values
    const existingDiscountFull = await prisma.discount_master.findUnique({
      where: { id: Number(req.params.id) },
    });

    const finalDiscountType = discount_type || existingDiscountFull.discount_type;
    const finalPublisherId = publisher_id || existingDiscountFull.publisher_id;
    const finalCustomerId = customer_id !== undefined ? customer_id : existingDiscountFull.customer_id;
    const finalSupplierId = supplier_id !== undefined ? supplier_id : existingDiscountFull.supplier_id;

    // Validate publisher
    if (finalPublisherId) {
      const publisher = await prisma.book_publisher.findFirst({
        where: { id: Number(finalPublisherId), company_id: companyId },
      });
      if (!publisher) {
        return res.status(400).json({ error: "Publisher not found" });
      }
    }

    // Validate based on discount_type
    if (finalDiscountType === "sale") {
      if (!finalCustomerId) {
        return res.status(400).json({ error: "Customer is required for sale discounts" });
      }
      const customer = await prisma.customer.findFirst({
        where: { id: Number(finalCustomerId), company_id: companyId },
      });
      if (!customer) {
        return res.status(400).json({ error: "Customer not found" });
      }
    } else if (finalDiscountType === "purchase") {
      if (!finalSupplierId) {
        return res.status(400).json({ error: "Supplier is required for purchase discounts" });
      }
      const supplier = await prisma.supplier.findFirst({
        where: { id: Number(finalSupplierId), company_id: companyId },
      });
      if (!supplier) {
        return res.status(400).json({ error: "Supplier not found" });
      }
    }

    // Validate discount_value if provided
    const finalDiscountUnit = discount_unit || existingDiscount.discount_unit;
    if (discount_value !== undefined) {
      if (finalDiscountUnit === "percentage" && (discount_value < 0 || discount_value > 100)) {
        return res.status(400).json({ error: "Percentage discount must be between 0 and 100" });
      }
      if (finalDiscountUnit === "fixed" && discount_value < 0) {
        return res.status(400).json({ error: "Fixed discount must be greater than or equal to 0" });
      }
    }

    const updateData = {};
    if (discount_type !== undefined) updateData.discount_type = discount_type;
    if (publisher_id !== undefined) updateData.publisher_id = Number(publisher_id);
    if (customer_id !== undefined) updateData.customer_id = customer_id ? Number(customer_id) : null;
    if (supplier_id !== undefined) updateData.supplier_id = supplier_id ? Number(supplier_id) : null;
    if (discount_value !== undefined) updateData.discount_value = parseFloat(discount_value);
    if (discount_unit !== undefined) updateData.discount_unit = discount_unit;
    if (status !== undefined) updateData.status = Boolean(status);
    if (effective_from !== undefined) updateData.effective_from = effective_from ? new Date(effective_from) : null;
    if (effective_to !== undefined) updateData.effective_to = effective_to ? new Date(effective_to) : null;
    if (description !== undefined) updateData.description = description || null;

    const updatedDiscount = await prisma.discount_master.update({
      where: {
        id: Number(req.params.id),
      },
      data: updateData,
      include: {
        publisher: {
          select: { id: true, name: true },
        },
        customer: {
          select: { id: true, name: true },
        },
        supplier: {
          select: { id: true, name: true },
        },
      },
    });

    res.json(updatedDiscount);
  } catch (error) {
    res.status(400).json({ error: error.message });
    console.log(error.message);
  }
};

const deleteSingleDiscountMaster = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // Verify that the discount belongs to the user's company
    const existingDiscount = await prisma.discount_master.findUnique({
      where: { id: Number(req.params.id) },
      select: { company_id: true },
    });

    if (!existingDiscount) {
      return res.status(404).json({ error: "Discount master not found" });
    }

    if (existingDiscount.company_id !== companyId) {
      return res.status(403).json({ error: "Discount master does not belong to your company" });
    }

    const deletedDiscount = await prisma.discount_master.delete({
      where: {
        id: Number(req.params.id),
      },
    });

    res.json(deletedDiscount);
  } catch (error) {
    res.status(400).json({ error: error.message });
    console.log(error.message);
  }
};

// Helper function to get applicable discount for a given context
// For sales: discountType = "sale", publisherId and customerId required
// For purchases: discountType = "purchase", publisherId and supplierId required
const getApplicableDiscount = async (companyId, discountType, publisherId, customerId = null, supplierId = null, date = new Date()) => {
  const whereCondition = {
    company_id: companyId,
    discount_type: discountType,
    publisher_id: publisherId,
    status: true,
    OR: [
      {
        effective_from: null,
        effective_to: null,
      },
      {
        effective_from: { lte: date },
        effective_to: null,
      },
      {
        effective_from: null,
        effective_to: { gte: date },
      },
      {
        effective_from: { lte: date },
        effective_to: { gte: date },
      },
    ],
  };

  if (discountType === "sale" && customerId) {
    whereCondition.customer_id = customerId;
  } else if (discountType === "purchase" && supplierId) {
    whereCondition.supplier_id = supplierId;
  }

  const discount = await prisma.discount_master.findFirst({
    where: whereCondition,
    orderBy: {
      created_at: "desc",
    },
  });

  return discount;
};

module.exports = {
  createSingleDiscountMaster,
  getAllDiscountMaster,
  getSingleDiscountMaster,
  updateSingleDiscountMaster,
  deleteSingleDiscountMaster,
  getApplicableDiscount,
};
