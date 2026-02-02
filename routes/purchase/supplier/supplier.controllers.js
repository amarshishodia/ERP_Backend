const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const createSingleSupplier = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }

  if (req.query.query === "deletemany") {
    try {
      // delete all suppliers (only for user's company)
      const deletedSupplier = await prisma.supplier.deleteMany({
        where: {
          id: {
            in: req.body.map((id) => parseInt(id)),
          },
          company_id: companyId,
        },
      });
      res.json(deletedSupplier);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else if (req.query.query === "createmany") {
    try {
      const upsert = req.query.upsert === "true";
      const rows = Array.isArray(req.body) ? req.body : [];

      if (upsert && rows.length > 0) {
        // Add or edit: upsert by phone (update if exists, create if not)
        let created = 0;
        let updated = 0;
        for (const row of rows) {
          const name = String(row.name || "").trim();
          const phone = String(row.phone || "").trim();
          const address = String(row.address || "").trim();
          if (!name || !phone || !address) continue;
          const existing = await prisma.supplier.findUnique({
            where: {
              phone_company_id: { phone, company_id: companyId },
            },
          });
          if (existing) {
            await prisma.supplier.update({
              where: { id: existing.id },
              data: { name, address },
            });
            updated += 1;
          } else {
            await prisma.supplier.create({
              data: { name, phone, address, company_id: companyId },
            });
            created += 1;
          }
        }
        res.json({ created, updated, message: `Created ${created}, updated ${updated}` });
      } else {
        // create many only (skip duplicates)
        const createdSupplier = await prisma.supplier.createMany({
          data: rows.map((supplier) => ({
            name: String(supplier.name || "").trim(),
            phone: String(supplier.phone || "").trim(),
            address: String(supplier.address || "").trim(),
            company_id: companyId,
          })).filter((s) => s.name && s.phone && s.address),
          skipDuplicates: true,
        });
        res.json(createdSupplier);
      }
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else {
    try {
      // create a single supplier from an object with company_id
      const createdSupplier = await prisma.supplier.create({
        data: {
          name: req.body.name,
          phone: req.body.phone,
          address: req.body.address,
          company_id: companyId,
        },
      });

      res.json(createdSupplier);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  }
};

const getAllSupplier = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }

  if (req.query.query === "all") {
    try {
      // get all suppliers with status filter for user's company
      const allSupplier = await prisma.supplier.findMany({
        where: {
          status: req.query.status === "false" ? false : true,
          company_id: companyId,
        },
        orderBy: {
          id: "asc",
        },
        include: {
          purchaseInvoice: true,
        },
      });
      res.json(allSupplier);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else if (req.query.status === "false") {
    try {
      const { skip, limit } = getPagination(req.query);
      // get all suppliers for user's company
      const allSupplier = await prisma.supplier.findMany({
        where: {
          status: false,
          company_id: companyId,
        },
        orderBy: {
          id: "asc",
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        include: {
          purchaseInvoice: true,
        },
      });
      res.json(allSupplier);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else if (req.query.query === "info") {
    try {
      // get all suppliers info for user's company
      const aggregations = await prisma.supplier.aggregate({
        where: {
          status: true,
          company_id: companyId,
        },
        _count: {
          id: true,
        },
      });
      res.json(aggregations);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else {
    const { skip, limit } = getPagination(req.query);
    try {
      // get all suppliers paginated for user's company
      const allSupplier = await prisma.supplier.findMany({
        where: {
          status: true,
          company_id: companyId,
        },
        orderBy: {
          id: "asc",
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        include: {
          purchaseInvoice: true,
        },
      });
      res.json(allSupplier);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  }
};

const getSingleSupplier = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const singleSupplier = await prisma.supplier.findUnique({
      where: {
        id: parseInt(req.params.id),
      },
      include: {
        purchaseInvoice: true,
      },
    });

    if (!singleSupplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    // Verify that the supplier belongs to the user's company
    if (singleSupplier.company_id !== companyId) {
      return res.status(403).json({ error: "Supplier does not belong to your company" });
    }

    // get individual supplier's due amount by calculating: purchase invoice's total_amount - return purchase invoices - transactions
    const allPurchaseInvoiceTotalAmount =
      await prisma.purchaseInvoice.aggregate({
        _sum: {
          total_amount: true,
          discount: true,
        },
        where: {
          supplier_id: parseInt(req.params.id),
          company_id: companyId,
        },
      });
    // all invoice of a supplier with return purchase invoice nested
    const suppliersAllInvoice = await prisma.supplier.findUnique({
      where: {
        id: parseInt(req.params.id),
      },
      include: {
        purchaseInvoice: {
          where: {
            company_id: companyId,
          },
          include: {
            returnPurchaseInvoice: {
              where: {
                status: true,
                company_id: companyId,
              },
            },
          },
        },
      },
    });

    // get all return purchase invoice of a customer
    const allReturnPurchaseInvoice = suppliersAllInvoice.purchaseInvoice.map(
      (invoice) => {
        return invoice.returnPurchaseInvoice;
      }
    );
    // calculate total return purchase invoice amount
    const TotalReturnPurchaseInvoice = allReturnPurchaseInvoice.reduce(
      (acc, invoice) => {
        const returnPurchaseInvoiceTotalAmount = invoice.reduce(
          (acc, invoice) => {
            return acc + invoice.total_amount;
          },
          0
        );
        return acc + returnPurchaseInvoiceTotalAmount;
      },
      0
    );
    console.log(allReturnPurchaseInvoice);
    console.log(TotalReturnPurchaseInvoice);
    // get all purchaseInvoice id
    const allPurchaseInvoiceId = suppliersAllInvoice.purchaseInvoice.map(
      (purchaseInvoice) => {
        return purchaseInvoice.id;
      }
    );
    // get all transactions related to purchaseInvoice
    const allPurchaseTransaction = await prisma.transaction.findMany({
      where: {
        type: "purchase",
        company_id: companyId,
        related_id: {
          in: allPurchaseInvoiceId,
        },
        OR: [
          {
            credit_id: 1,
          },
          {
            credit_id: 2,
          },
        ],
      },
      include: {
        debit: {
          select: {
            name: true,
          },
        },
        credit: {
          select: {
            name: true,
          },
        },
      },
    });
    // get all transactions related to return purchaseInvoice
    const allReturnPurchaseTransaction = await prisma.transaction.findMany({
      where: {
        type: "purchase_return",
        company_id: companyId,
        related_id: {
          in: allPurchaseInvoiceId,
        },
        OR: [
          {
            debit_id: 1,
          },
          {
            debit_id: 2,
          },
        ],
      },
      include: {
        debit: {
          select: {
            name: true,
          },
        },
        credit: {
          select: {
            name: true,
          },
        },
      },
    });
    // calculate the discount earned amount at the time of make the payment
    const discountEarned = await prisma.transaction.findMany({
      where: {
        type: "purchase",
        company_id: companyId,
        related_id: {
          in: allPurchaseInvoiceId,
        },
        credit_id: 13,
      },
      include: {
        debit: {
          select: {
            name: true,
          },
        },
        credit: {
          select: {
            name: true,
          },
        },
      },
    });
    const totalPaidAmount = allPurchaseTransaction.reduce((acc, cur) => {
      return acc + cur.amount;
    }, 0);
    const paidAmountReturn = allReturnPurchaseTransaction.reduce((acc, cur) => {
      return acc + cur.amount;
    }, 0);
    const totalDiscountEarned = discountEarned.reduce((acc, cur) => {
      return acc + cur.amount;
    }, 0);
    //get all transactions related to purchaseInvoiceId
    const allTransaction = await prisma.transaction.findMany({
      where: {
        company_id: companyId,
        related_id: {
          in: allPurchaseInvoiceId,
        },
      },
      include: {
        debit: {
          select: {
            name: true,
          },
        },
        credit: {
          select: {
            name: true,
          },
        },
      },
    });
    console.log(
      "total_amount",
      allPurchaseInvoiceTotalAmount._sum.total_amount
    );
    console.log("discount", allPurchaseInvoiceTotalAmount._sum.discount);
    console.log("totalPaidAmount", totalPaidAmount);
    console.log("totalDiscountEarned", totalDiscountEarned);
    console.log("TotalReturnPurchaseInvoice", TotalReturnPurchaseInvoice);
    console.log("paidAmountReturn", paidAmountReturn);
    const due_amount =
      parseFloat(allPurchaseInvoiceTotalAmount._sum.total_amount) -
      parseFloat(allPurchaseInvoiceTotalAmount._sum.discount) -
      parseFloat(totalPaidAmount) -
      parseFloat(totalDiscountEarned) -
      parseFloat(TotalReturnPurchaseInvoice) +
      parseFloat(paidAmountReturn);
    console.log("due_amount", due_amount);

    // include due_amount in singleSupplier
    singleSupplier.due_amount = due_amount ? due_amount : 0;
    singleSupplier.allReturnPurchaseInvoice = allReturnPurchaseInvoice.flat();
    singleSupplier.allTransaction = allTransaction;

    //==================== UPDATE supplier's purchase invoice information START====================
    // async is used for not blocking the main thread
    const updatedInvoices = singleSupplier.purchaseInvoice.map(async (item) => {
      const paidAmount = allPurchaseTransaction
        .filter((transaction) => transaction.related_id === item.id)
        .reduce((acc, curr) => acc + curr.amount, 0);
      const paidAmountReturn = allReturnPurchaseTransaction
        .filter((transaction) => transaction.related_id === item.id)
        .reduce((acc, curr) => acc + curr.amount, 0);
      const singleDiscountEarned = discountEarned
        .filter((transaction) => transaction.related_id === item.id)
        .reduce((acc, curr) => acc + curr.amount, 0);
      const returnAmount = allReturnPurchaseInvoice
        .flat()
        .filter(
          (returnPurchaseInvoice) =>
            returnPurchaseInvoice.purchaseInvoice_id === item.id
        )
        .reduce((acc, curr) => acc + curr.total_amount, 0);
      return {
        ...item,
        paid_amount: paidAmount,
        discount: item.discount + singleDiscountEarned,
        due_amount:
          item.total_amount -
          item.discount -
          paidAmount -
          returnAmount +
          paidAmountReturn -
          singleDiscountEarned,
      };
    });
    singleSupplier.purchaseInvoice = await Promise.all(updatedInvoices);
    //==================== UPDATE supplier's purchase invoice information END====================
    res.json(singleSupplier);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const updateSingleSupplier = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // Verify that the supplier belongs to the user's company
    const existingSupplier = await prisma.supplier.findUnique({
      where: { id: parseInt(req.params.id) },
      select: { company_id: true },
    });

    if (!existingSupplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    if (existingSupplier.company_id !== companyId) {
      return res.status(403).json({ error: "Supplier does not belong to your company" });
    }

    const updatedSupplier = await prisma.supplier.update({
      where: {
        id: parseInt(req.params.id),
      },
      data: {
        name: req.body.name,
        phone: req.body.phone,
        address: req.body.address,
      },
    });
    res.json(updatedSupplier);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const deleteSingleSupplier = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // Verify that the supplier belongs to the user's company
    const existingSupplier = await prisma.supplier.findUnique({
      where: { id: parseInt(req.params.id) },
      select: { company_id: true },
    });

    if (!existingSupplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    if (existingSupplier.company_id !== companyId) {
      return res.status(403).json({ error: "Supplier does not belong to your company" });
    }

    // delete a single supplier
    const deletedSupplier = await prisma.supplier.update({
      where: {
        id: parseInt(req.params.id),
      },
      data: {
        status: req.body.status,
      },
    });
    res.json(deletedSupplier);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

module.exports = {
  createSingleSupplier,
  getAllSupplier,
  getSingleSupplier,
  updateSingleSupplier,
  deleteSingleSupplier,
};
