const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const prisma = require("../../../utils/prisma");

const createSingleCustomer = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }

  if (req.query.query === "deletemany") {
    try {
      // delete many customer at once
      const deletedAccount = await prisma.customer.deleteMany({
        where: {
          id: {
            in: req.body.map((id) => parseInt(id)),
          },
          company_id: companyId,
        },
      });
      res.json(deletedAccount);
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
          const existing = await prisma.customer.findUnique({
            where: {
              phone_company_id: { phone, company_id: companyId },
            },
          });
          if (existing) {
            await prisma.customer.update({
              where: { id: existing.id },
              data: { name, address },
            });
            updated += 1;
          } else {
            await prisma.customer.create({
              data: { name, phone, address, company_id: companyId },
            });
            created += 1;
          }
        }
        res.json({ created, updated, message: `Created ${created}, updated ${updated}` });
      } else {
        // create many only (skip duplicates)
        const createdCustomer = await prisma.customer.createMany({
          data: rows.map((c) => ({
            name: String(c.name || "").trim(),
            phone: String(c.phone || "").trim(),
            address: String(c.address || "").trim(),
            company_id: companyId,
          })).filter((c) => c.name && c.phone && c.address),
          skipDuplicates: true,
        });
        res.json(createdCustomer);
      }
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else {
    try {
      // create single customer from an object
      const createdCustomer = await prisma.customer.create({
        data: {
          name: req.body.name,
          phone: req.body.phone,
          address: req.body.address,
          company_id: companyId,
        },
      });
      res.json(createdCustomer);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  }
};

const getAllCustomer = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }

  if (req.query.query === "all") {
    try {
      console.log("Getting all customers with status:", req.query.status);
      // get all customer with status filter
      const allCustomer = await prisma.customer.findMany({
        orderBy: {
          id: "asc",
        },
        include: {
          saleInvoice: {
            where: {
              company_id: companyId,
            },
          },
        },
        where: {
          status: req.query.status === "false" ? false : true,
          company_id: companyId,
        },
      });
      console.log("Found customers:", allCustomer.length);
      res.json(allCustomer);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else if (req.query.query === "info") {
    // get all customer info
    const aggregations = await prisma.customer.aggregate({
      _count: {
        id: true,
      },
      where: {
        status: true,
        company_id: companyId,
      },
    });
    res.json(aggregations);
  } else if (req.query.status === "false") {
    try {
      const { skip, limit } = getPagination(req.query);
      // get all customer
      const allCustomer = await prisma.customer.findMany({
        orderBy: {
          id: "asc",
        },
        include: {
          saleInvoice: {
            where: {
              company_id: companyId,
            },
          },
        },
        where: {
          status: false,
          company_id: companyId,
        },
        skip: parseInt(skip),
        take: parseInt(limit),
      });
      res.json(allCustomer);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else {
    const { skip, limit } = getPagination(req.query);
    try {
      // get all customer paginated
      const allCustomer = await prisma.customer.findMany({
        orderBy: {
          id: "asc",
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        include: {
          saleInvoice: {
            where: {
              company_id: companyId,
            },
          },
        },
        where: {
          status: true,
          company_id: companyId,
        },
      });
      res.json(allCustomer);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  }
};

const getSingleCustomer = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const singleCustomer = await prisma.customer.findFirst({
      where: {
        id: parseInt(req.params.id),
        company_id: companyId,
      },
      include: {
        saleInvoice: {
          where: {
            company_id: companyId,
          },
        },
      },
    });

    if (!singleCustomer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // get individual customer's due amount by calculating: sale invoice's total_amount - return sale invoices - transactions
    const allSaleInvoiceTotalAmount = await prisma.saleInvoice.aggregate({
      _sum: {
        total_amount: true,
        discount: true,
      },
      where: {
        customer_id: parseInt(req.params.id),
        company_id: companyId,
      },
    });
    // all invoice of a customer with return sale invoice nested
    const customersAllInvoice = await prisma.customer.findFirst({
      where: {
        id: parseInt(req.params.id),
        company_id: companyId,
      },
      include: {
        saleInvoice: {
          where: {
            company_id: companyId,
          },
          include: {
            returnSaleInvoice: {
              where: {
                status: true,
                company_id: companyId,
              },
            },
          },
        },
      },
    });

    if (!customersAllInvoice) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // get all return sale invoice of a customer
    const allReturnSaleInvoice = customersAllInvoice.saleInvoice.map(
      (invoice) => {
        return invoice.returnSaleInvoice;
      }
    );
    // calculate total return sale invoice amount
    const TotalReturnSaleInvoice = allReturnSaleInvoice.reduce(
      (acc, invoice) => {
        const returnSaleInvoiceTotalAmount = invoice.reduce((acc, invoice) => {
          return acc + invoice.total_amount;
        }, 0);
        return acc + returnSaleInvoiceTotalAmount;
      },
      0
    );
    console.log(allReturnSaleInvoice);
    console.log(TotalReturnSaleInvoice);
    // get all saleInvoice id
    const allSaleInvoiceId = customersAllInvoice.saleInvoice.map(
      (saleInvoice) => {
        return saleInvoice.id;
      }
    );
    // get all transactions related to saleInvoice
    const allSaleTransaction = await prisma.transaction.findMany({
      where: {
        type: "sale",
        related_id: {
          in: allSaleInvoiceId,
        },
        company_id: companyId,
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
    // get all transactions related to return saleInvoice
    const allReturnSaleTransaction = await prisma.transaction.findMany({
      where: {
        type: "sale_return",
        related_id: {
          in: allSaleInvoiceId,
        },
        company_id: companyId,
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
    // calculate the discount given amount at the time of make the payment
    const discountGiven = await prisma.transaction.findMany({
      where: {
        type: "sale",
        related_id: {
          in: allSaleInvoiceId,
        },
        company_id: companyId,
        debit_id: 14,
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
    const totalPaidAmount = allSaleTransaction.reduce((acc, cur) => {
      return acc + cur.amount;
    }, 0);
    const paidAmountReturn = allReturnSaleTransaction.reduce((acc, cur) => {
      return acc + cur.amount;
    }, 0);
    const totalDiscountGiven = discountGiven.reduce((acc, cur) => {
      return acc + cur.amount;
    }, 0);
    //get all transactions related to saleInvoiceId
    const allTransaction = await prisma.transaction.findMany({
      where: {
        related_id: {
          in: allSaleInvoiceId,
        },
        company_id: companyId,
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
    console.log("total_amount", allSaleInvoiceTotalAmount._sum.total_amount);
    console.log("discount", allSaleInvoiceTotalAmount._sum.discount);
    console.log("totalPaidAmount", totalPaidAmount);
    console.log("totalDiscountGiven", totalDiscountGiven);
    console.log("TotalReturnSaleInvoice", TotalReturnSaleInvoice);
    console.log("paidAmountReturn", paidAmountReturn);
    const due_amount =
      parseFloat(allSaleInvoiceTotalAmount._sum.total_amount) -
      parseFloat(allSaleInvoiceTotalAmount._sum.discount) -
      parseFloat(totalPaidAmount) -
      parseFloat(totalDiscountGiven) -
      parseFloat(TotalReturnSaleInvoice) +
      parseFloat(paidAmountReturn);
    console.log("due_amount", due_amount);

    // include due_amount in singleCustomer
    singleCustomer.due_amount = due_amount ? due_amount : 0;
    singleCustomer.allReturnSaleInvoice = allReturnSaleInvoice.flat();
    singleCustomer.allTransaction = allTransaction;
    //==================== UPDATE customer's purchase invoice information START====================
    // async is used for not blocking the main thread
    const updatedInvoices = singleCustomer.saleInvoice.map(async (item) => {
      const paidAmount = allSaleTransaction
        .filter((transaction) => transaction.related_id === item.id)
        .reduce((acc, curr) => acc + curr.amount, 0);
      const paidAmountReturn = allReturnSaleTransaction
        .filter((transaction) => transaction.related_id === item.id)
        .reduce((acc, curr) => acc + curr.amount, 0);
      const singleDiscountGiven = discountGiven
        .filter((transaction) => transaction.related_id === item.id)
        .reduce((acc, curr) => acc + curr.amount, 0);
      const returnAmount = allReturnSaleInvoice
        .flat()
        .filter(
          (returnSaleInvoice) => returnSaleInvoice.saleInvoice_id === item.id
        )
        .reduce((acc, curr) => acc + curr.total_amount, 0);
      return {
        ...item,
        paid_amount: paidAmount,
        discount: item.discount + singleDiscountGiven,
        due_amount:
          item.total_amount -
          item.discount -
          paidAmount -
          returnAmount +
          paidAmountReturn -
          singleDiscountGiven,
      };
    });
    singleCustomer.saleInvoice = await Promise.all(updatedInvoices);
    //==================== UPDATE customer's sale invoice information END====================

    res.json(singleCustomer);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const updateSingleCustomer = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // Verify that the customer belongs to the user's company
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        id: parseInt(req.params.id),
        company_id: companyId,
      },
    });

    if (!existingCustomer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const updatedCustomer = await prisma.customer.update({
      where: {
        id: parseInt(req.params.id),
      },
      data: {
        name: req.body.name,
        phone: req.body.phone,
        address: req.body.address,
      },
    });
    res.json(updatedCustomer);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const deleteSingleCustomer = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // Verify that the customer belongs to the user's company
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        id: parseInt(req.params.id),
        company_id: companyId,
      },
    });

    if (!existingCustomer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const deletedCustomer = await prisma.customer.update({
      where: {
        id: parseInt(req.params.id),
      },
      data: {
        status: req.body.status,
      },
    });
    res.json(deletedCustomer);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

module.exports = {
  createSingleCustomer,
  getAllCustomer,
  getSingleCustomer,
  updateSingleCustomer,
  deleteSingleCustomer,
};
