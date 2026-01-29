const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const createSingleReturnSaleInvoice = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }

  // Verify that the sale invoice belongs to the user's company
  const saleInvoice = await prisma.saleInvoice.findFirst({
    where: {
      id: Number(req.body.saleInvoice_id),
      company_id: companyId,
    },
  });

  if (!saleInvoice) {
    return res.status(404).json({ error: "Sale invoice not found" });
  }

  // Verify that all products exist (products are now master)
  const productIds = req.body.returnSaleInvoiceProduct.map(p => Number(p.product_id));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, purchase_price: true },
  });

  if (products.length !== productIds.length) {
    return res.status(404).json({ error: "Some products not found" });
  }

  // calculate total sale price
  let totalSalePrice = 0;
  req.body.returnSaleInvoiceProduct.forEach((item) => {
    totalSalePrice +=
      parseFloat(item.product_sale_price) * parseFloat(item.product_quantity);
  });
  // get all product asynchronously
  const allProduct = await Promise.all(
    req.body.returnSaleInvoiceProduct.map(async (item) => {
      const product = await prisma.product.findUnique({
        where: {
          id: item.product_id,
        },
      });
      return product;
    })
  );
  // iterate over all product and calculate total purchase price
  totalPurchasePrice = 0;
  req.body.returnSaleInvoiceProduct.forEach((item, index) => {
    totalPurchasePrice +=
      allProduct[index].purchase_price * item.product_quantity;
  });
  try {
    // ==========================START calculate the due amount of sale invoice ==========================
    // calculate the due before return sale invoice creation
    const singleSaleInvoice = await prisma.saleInvoice.findFirst({
      where: {
        id: Number(req.body.saleInvoice_id),
        company_id: companyId,
      },
      include: {
        saleInvoiceProduct: {
          include: {
            product: true,
          },
        },
        customer: true,
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
    // transactions of the paid amount
    const transactions2 = await prisma.transaction.findMany({
      where: {
        type: "sale",
        related_id: Number(req.body.saleInvoice_id),
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
    // transaction of the total return amount
    const returnSaleInvoice = await prisma.returnSaleInvoice.findMany({
      where: {
        saleInvoice_id: Number(req.body.saleInvoice_id),
        company_id: companyId,
      },
      include: {
        returnSaleInvoiceProduct: {
          include: {
            product: true,
          },
        },
      },
    });
    // calculate the discount given amount at the time of make the payment
    const transactions3 = await prisma.transaction.findMany({
      where: {
        type: "sale",
        related_id: Number(req.body.saleInvoice_id),
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
    // calculate the total amount return back to customer for return sale invoice from transactions
    // transactions of the paid amount
    const transactions4 = await prisma.transaction.findMany({
      where: {
        type: "sale_return",
        related_id: Number(req.body.saleInvoice_id),
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
    const paidAmountReturn = transactions4.reduce(
      (acc, curr) => acc + curr.amount,
      0
    );
    console.log("paidAmountReturn", paidAmountReturn);
    // sum total amount of all transactions
    const totalPaidAmount = transactions2.reduce(
      (acc, item) => acc + item.amount,
      0
    );
    // sum of total discount given amount at the time of make the payment
    const totalDiscountAmount = transactions3.reduce(
      (acc, item) => acc + item.amount,
      0
    );
    // check if total transaction amount is equal to total_amount - discount - return invoice amount
    const totalReturnAmount = returnSaleInvoice.reduce(
      (acc, item) => acc + item.total_amount,
      0
    );
    console.log(singleSaleInvoice.total_amount);
    console.log(singleSaleInvoice.discount);
    console.log(totalPaidAmount);
    console.log(totalDiscountAmount);
    console.log(totalReturnAmount);
    const dueAmount =
      singleSaleInvoice.total_amount -
      singleSaleInvoice.discount -
      totalPaidAmount -
      totalDiscountAmount -
      totalReturnAmount +
      paidAmountReturn;
    console.log("dueAmount", dueAmount);
    console.log("totalSalePrice", totalSalePrice);
    // ==========================END calculate the due amount of sale invoice ==========================
    // convert all incoming date to a specific format.
    const date = new Date(req.body.date).toISOString().split("T")[0];
    // create return sale invoice
    const createdReturnSaleInvoice = await prisma.returnSaleInvoice.create({
      data: {
        date: new Date(date),
        total_amount: totalSalePrice,
        company: {
          connect: { id: companyId },
        },
        saleInvoice: {
          connect: {
            id: Number(req.body.saleInvoice_id),
          },
        },
        note: req.body.note,
        // map and save all products from request body array of products to database
        returnSaleInvoiceProduct: {
          create: req.body.returnSaleInvoiceProduct.map((product) => ({
            product: {
              connect: {
                id: Number(product.product_id),
              },
            },
            product_quantity: Number(product.product_quantity),
            product_sale_price: parseFloat(product.product_sale_price),
          })),
        },
      },
    });

    console.log("req.body.saleInvoice_id", req.body.saleInvoice_id);
    // return transaction Account Receivable - for due amount
    if (dueAmount >= totalSalePrice) {
      await prisma.transaction.create({
        data: {
          date: new Date(date),
          debit_id: 8,
          credit_id: 4,
          amount: parseFloat(totalSalePrice),
          particulars: `Account Receivable on Sale return invoice #${createdReturnSaleInvoice.id} of sale invoice #${req.body.saleInvoice_id}`,
          type: "sale_return",
          related_id: Number(req.body.saleInvoice_id),
          company: {
            connect: { id: companyId },
          },
        },
      });
    }
    // dueAmount is less than total Accounts Receivable - for cash amount
    // two transaction will be created for cash and due adjustment
    // TODO: dynamic credit id like bank, cash, etc
    if (dueAmount < totalSalePrice) {
      await prisma.transaction.create({
        data: {
          date: new Date(date),
          debit_id: 8,
          credit_id: 4,
          amount: parseFloat(dueAmount),
          particulars: `Account Receivable on Sale return invoice #${createdReturnSaleInvoice.id} of sale invoice #${req.body.saleInvoice_id}`,
          type: "sale_return",
          related_id: Number(req.body.saleInvoice_id),
          company: {
            connect: { id: companyId },
          },
        },
      });
      await prisma.transaction.create({
        data: {
          date: new Date(date),
          debit_id: 8,
          credit_id: 1,
          amount: parseFloat(totalSalePrice - dueAmount),
          particulars: `Cash paid on Sale return invoice #${createdReturnSaleInvoice.id} of sale invoice #${req.body.saleInvoice_id}`,
          type: "sale_return",
          related_id: Number(req.body.saleInvoice_id),
          company: {
            connect: { id: companyId },
          },
        },
      });
    }
    // goods received on return sale transaction create
    await prisma.transaction.create({
      data: {
        date: new Date(date),
        debit_id: 3,
        credit_id: 9,
        amount: parseFloat(totalPurchasePrice),
        particulars: `Cost of sales reduce on Sale return Invoice #${createdReturnSaleInvoice.id} of sale invoice #${req.body.saleInvoice_id}`,
        type: "sale_return",
        related_id: req.body.saleInvoice_id,
        company: {
          connect: { id: companyId },
        },
      },
    });
    // iterate through all products of this return sale invoice and increase product_stock
    for (const item of req.body.returnSaleInvoiceProduct) {
      const productId = Number(item.product_id);
      const quantity = Number(item.product_quantity);
      
      // Update product_stock for this company
      await prisma.product_stock.update({
        where: {
          product_id_company_id: {
            product_id: productId,
            company_id: companyId,
          },
        },
        data: {
          quantity: {
            increment: quantity,
          },
        },
      });
    }
    // decrease sale invoice profit by return sale invoice's calculated profit profit
    const returnSaleInvoiceProfit = totalSalePrice - totalPurchasePrice;
    await prisma.saleInvoice.update({
      where: {
        id: Number(req.body.saleInvoice_id),
      },
      data: {
        profit: {
          decrement: returnSaleInvoiceProfit,
        },
      },
    });
    res.json({ createdReturnSaleInvoice });
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const getAllReturnSaleInvoice = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }

  if (req.query.query === "info") {
    // get sale invoice info
    const aggregations = await prisma.returnSaleInvoice.aggregate({
      where: {
        company_id: companyId,
      },
      _count: {
        id: true,
      },
      _sum: {
        total_amount: true,
      },
    });
    res.json(aggregations);
  } else if (req.query.query === "all") {
    try {
      // get all sale invoice
      const allSaleInvoice = await prisma.returnSaleInvoice.findMany({
        where: {
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
      res.json(allSaleInvoice);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else if (req.query.query === "group") {
    try {
      // get all sale invoice
      const allSaleInvoice = await prisma.returnSaleInvoice.groupBy({
        where: {
          company_id: companyId,
        },
        orderBy: {
          date: "asc",
        },
        by: ["date"],
        _sum: {
          total_amount: true,
        },
        _count: {
          id: true,
        },
      });
      res.json(allSaleInvoice);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else if (req.query.status === "false") {
    try {
      const { skip, limit } = getPagination(req.query);
      const [aggregations, allSaleInvoice] = await prisma.$transaction([
        // get info of selected parameter data
        prisma.returnSaleInvoice.aggregate({
          _count: {
            id: true,
          },
          _sum: {
            total_amount: true,
          },
          where: {
            date: {
              gte: new Date(req.query.startdate),
              lte: new Date(req.query.enddate),
            },
            status: false,
            company_id: companyId,
          },
        }),
        // get returnsaleInvoice paginated and by start and end date
        prisma.returnSaleInvoice.findMany({
          orderBy: [
            {
              id: "desc",
            },
          ],
          skip: Number(skip),
          take: Number(limit),
          include: {
            saleInvoice: {
              where: {
                company_id: companyId,
              },
            },
          },
          where: {
            date: {
              gte: new Date(req.query.startdate),
              lte: new Date(req.query.enddate),
            },
            status: false,
            company_id: companyId,
          },
        }),
      ]);
      res.json({ aggregations, allSaleInvoice });
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else {
    const { skip, limit } = getPagination(req.query);
    try {
      // get sale invoice with pagination and info
      const [aggregations, allSaleInvoice] = await prisma.$transaction([
        // get info of selected parameter data
        prisma.returnSaleInvoice.aggregate({
          _count: {
            id: true,
          },
          _sum: {
            total_amount: true,
          },
          where: {
            date: {
              gte: new Date(req.query.startdate),
              lte: new Date(req.query.enddate),
            },
            status: true,
            company_id: companyId,
          },
        }),
        // get returnsaleInvoice paginated and by start and end date
        prisma.returnSaleInvoice.findMany({
          orderBy: [
            {
              id: "desc",
            },
          ],
          skip: Number(skip),
          take: Number(limit),
          include: {
            saleInvoice: {
              where: {
                company_id: companyId,
              },
            },
          },
          where: {
            date: {
              gte: new Date(req.query.startdate),
              lte: new Date(req.query.enddate),
            },
            status: true,
            company_id: companyId,
          },
        }),
      ]);
      res.json({ aggregations, allSaleInvoice });
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  }
};

const getSingleReturnSaleInvoice = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const singleProduct = await prisma.returnSaleInvoice.findFirst({
      where: {
        id: Number(req.params.id),
        company_id: companyId,
      },
      include: {
        returnSaleInvoiceProduct: {
          include: {
            product: true,
          },
        },
        saleInvoice: {
          where: {
            company_id: companyId,
          },
        },
      },
    });

    if (!singleProduct) {
      return res.status(404).json({ error: "Return sale invoice not found" });
    }

    res.json(singleProduct);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

// TODO: update sale invoice: NO UPDATE ALLOWED FOR NOW
const updateSingleReturnSaleInvoice = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // Verify that the return sale invoice belongs to the user's company
    const existingReturnSaleInvoice = await prisma.returnSaleInvoice.findFirst({
      where: {
        id: Number(req.params.id),
        company_id: companyId,
      },
    });

    if (!existingReturnSaleInvoice) {
      return res.status(404).json({ error: "Return sale invoice not found" });
    }

    const updatedProduct = await prisma.returnSaleInvoice.update({
      where: {
        id: Number(req.params.id),
      },
      data: {
        name: req.body.name,
        quantity: Number(req.body.quantity),
        purchase_price: Number(req.body.purchase_price),
        sale_price: Number(req.body.sale_price),
        note: req.body.note,
      },
    });
    res.json(updatedProduct);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

// on delete purchase invoice, decrease product quantity, customer due amount decrease, transaction create
const deleteSingleReturnSaleInvoice = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // get purchase invoice details
    const returnSaleInvoice = await prisma.returnSaleInvoice.findFirst({
      where: {
        id: Number(req.params.id),
        company_id: companyId,
      },
      include: {
        returnSaleInvoiceProduct: {
          include: {
            product: true,
          },
        },
        saleInvoice: {
          where: {
            company_id: companyId,
          },
        },
      },
    });

    if (!returnSaleInvoice) {
      return res.status(404).json({ error: "Return sale invoice not found" });
    }
    // product_stock quantity decrease (reversing the return)
    for (const item of returnSaleInvoice.returnSaleInvoiceProduct) {
      await prisma.product_stock.update({
        where: {
          product_id_company_id: {
            product_id: Number(item.product_id),
            company_id: companyId,
          },
        },
        data: {
          quantity: {
            decrement: Number(item.product_quantity),
          },
        },
      });
    }
    // all operations in one transaction
    const [deleteSaleInvoice, customer, transaction] =
      await prisma.$transaction([
        // purchase invoice delete
        prisma.returnSaleInvoice.update({
          where: {
            id: Number(req.params.id),
          },
          data: {
            status: req.body.status,
          },
        }),
        // customer due amount decrease
        // prisma.customer.update({
        // 	where: {
        // 		id: Number(returnPurchaseInvoice.customer_id),
        // 	},
        // 	data: {
        // 		due_amount: {
        // 			decrement: Number(returnPurchaseInvoice.due_amount),
        // 		},
        // 	},
        // }),
        // new transaction will be created
        // prisma.transaction.create({
        // 	data: {
        // 		date: new Date(),
        // 		type: "purchase_deleted",
        // 		related_id: Number(req.params.id),
        // 		amount: parseFloat(returnPurchaseInvoice.paid_amount),
        // 		particulars: "paid amount refunded",
        // 	},
        // }),
      ]);
    res.json({
      deleteSaleInvoice,
      // customer,
      // transaction,
    });
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

module.exports = {
  createSingleReturnSaleInvoice,
  getAllReturnSaleInvoice,
  getSingleReturnSaleInvoice,
  updateSingleReturnSaleInvoice,
  deleteSingleReturnSaleInvoice,
};
