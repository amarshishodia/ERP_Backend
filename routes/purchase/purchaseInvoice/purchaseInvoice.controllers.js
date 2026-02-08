const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { createTransactionWithSubAccounts } = require("../../../utils/transactionHelper");

const createSinglePurchaseInvoice = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }

  // Verify that the supplier belongs to the user's company
  const supplier = await prisma.supplier.findUnique({
    where: { id: Number(req.body.supplier_id) },
    select: { company_id: true },
  });

  if (!supplier) {
    return res.status(404).json({ error: "Supplier not found" });
  }

  if (supplier.company_id !== companyId) {
    return res.status(403).json({ error: "Supplier does not belong to your company" });
  }

  // Verify that all products exist (products are now master, no company check needed)
  const productIds = req.body.purchaseInvoiceProduct.map(p => Number(p.product_id));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true },
  });

  if (products.length !== productIds.length) {
    return res.status(404).json({ error: "Some products not found" });
  }

  // calculate total purchase price with product-level discounts
  // using purchase price, product_quantity and product_discount
  let totalPurchasePrice = 0;
  let totalProductDiscount = 0;
  
  req.body.purchaseInvoiceProduct.forEach((item) => {
    const itemTotal = parseFloat(item.product_purchase_price) * parseFloat(item.product_quantity);
    const itemDiscount = (itemTotal * parseFloat(item.product_purchase_discount || 0)) / 100;
    
    totalPurchasePrice += itemTotal;
    totalProductDiscount += itemDiscount;
  });
  
  // Calculate final amounts
  const subtotalAfterProductDiscounts = totalPurchasePrice - totalProductDiscount;
  const billDiscount = parseFloat(req.body.discount || 0);
  const roundOffAmount = req.body.round_off_enabled ? parseFloat(req.body.round_off_amount || 0) : 0;
  const paidAmount = parseFloat(req.body.paid_amount || 0);
  const finalTotal = subtotalAfterProductDiscounts + roundOffAmount;
  const dueAmount = finalTotal - billDiscount - paidAmount;
  
  // Handle order linking
  const sales_order_id = req.body.sales_order_id ? Number(req.body.sales_order_id) : null;
  const purchase_order_id = req.body.purchase_order_id ? Number(req.body.purchase_order_id) : null;

  // Verify orders exist and belong to company if provided
  if (sales_order_id) {
    const salesOrder = await prisma.sales_order.findFirst({
      where: {
        id: sales_order_id,
        company_id: companyId,
      },
    });
    if (!salesOrder) {
      return res.status(404).json({ error: "Sales order not found" });
    }
  }

  if (purchase_order_id) {
    const purchaseOrder = await prisma.purchase_order.findFirst({
      where: {
        id: purchase_order_id,
        company_id: companyId,
      },
    });
    if (!purchaseOrder) {
      return res.status(404).json({ error: "Purchase order not found" });
    }
  }
  
  try {
    // convert all incoming data to a specific format.
    const date = new Date(req.body.date).toISOString().split("T")[0];
    // create purchase invoice
    const createdInvoice = await prisma.purchaseInvoice.create({
      data: {
        date: new Date(date),
        total_amount: finalTotal,
        discount: billDiscount,
        paid_amount: paidAmount,
        due_amount: dueAmount,
        total_product_discount: totalProductDiscount,
        round_off_enabled: req.body.round_off_enabled || false,
        round_off_amount: roundOffAmount,
        sales_order_id: sales_order_id,
        purchase_order_id: purchase_order_id,
        company: {
          connect: { id: companyId },
        },
        supplier: {
          connect: {
            id: Number(req.body.supplier_id),
          },
        },
        note: req.body.note || null,
        supplier_memo_no: req.body.supplier_memo_no || null,
        // map and save all products from request body array of products to database
        purchaseInvoiceProduct: {
          create: req.body.purchaseInvoiceProduct.map((product) => ({
            product: {
              connect: {
                id: Number(product.product_id),
              },
            },
            product_quantity: Number(product.product_quantity),
            product_purchase_price: parseFloat(product.product_purchase_price),
            product_purchase_discount: parseFloat(product.product_purchase_discount || 0)
          })),
        }, 
      },
    });
    // pay on purchase transaction create
    if (paidAmount > 0) {
      await createTransactionWithSubAccounts({
        date: new Date(date),
        sub_debit_id: 3, // Inventory
        sub_credit_id: 1, // Cash
        amount: paidAmount,
        particulars: `Cash paid on Purchase Invoice #${createdInvoice.id}`,
        type: "purchase",
        related_id: createdInvoice.id,
        company_id: companyId,
      });
    }
    // if purchase on due then create another transaction
    if (dueAmount > 0) {
      await createTransactionWithSubAccounts({
        date: new Date(date),
        sub_debit_id: 3, // Inventory
        sub_credit_id: 5, // Accounts Payable
        amount: dueAmount,
        particulars: `Due on Purchase Invoice #${createdInvoice.id}`,
        type: "purchase",
        related_id: createdInvoice.id,
        company_id: companyId,
      });
    }
    // iterate through all products of this purchase invoice and update product_stock, create purchase history
    // Calculate effective purchase price considering both product discount and bill discount
    for (const item of req.body.purchaseInvoiceProduct) {
      // Calculate price after product-level discount
      const itemTotal = parseFloat(item.product_purchase_price) * parseFloat(item.product_quantity);
      const itemProductDiscount = (itemTotal * parseFloat(item.product_purchase_discount || 0)) / 100;
      const itemPriceAfterProductDiscount = itemTotal - itemProductDiscount;
      
      // Calculate proportional bill discount for this product
      // Bill discount is allocated proportionally based on each product's contribution to subtotalAfterProductDiscounts
      const billDiscountAllocation = subtotalAfterProductDiscounts > 0 
        ? (itemPriceAfterProductDiscount / subtotalAfterProductDiscounts) * billDiscount
        : 0;
      
      // Calculate effective price per unit after all discounts
      const effectiveTotalPrice = itemPriceAfterProductDiscount - billDiscountAllocation;
      const effectivePricePerUnit = effectiveTotalPrice / parseFloat(item.product_quantity);
      
      const productId = Number(item.product_id);
      const quantity = Number(item.product_quantity);
      
      // Update product purchase price (master product)
      await prisma.product.update({
        where: { id: productId },
        data: {
          purchase_price: parseFloat(effectivePricePerUnit.toFixed(2)),
        },
      });
      
      // Update product_stock for this company
      await prisma.product_stock.upsert({
        where: {
          product_id_company_id: {
            product_id: productId,
            company_id: companyId,
          },
        },
        update: {
          quantity: {
            increment: quantity,
          },
        },
        create: {
          product_id: productId,
          company_id: companyId,
          quantity: quantity,
        },
      });
      
      // Create purchase history entry
      await prisma.product_purchase_history.create({
        data: {
          product_id: productId,
          company_id: companyId,
          purchase_invoice_id: createdInvoice.id,
          supplier_id: Number(req.body.supplier_id),
          quantity: quantity,
          purchase_price: parseFloat(item.product_purchase_price),
          discount: parseFloat(item.product_purchase_discount || 0),
          total_amount: effectiveTotalPrice,
          purchase_date: new Date(date),
          note: req.body.note || null,
        },
      });
    }

    // Update order fulfillment/received quantities if linked
    if (sales_order_id) {
      // Update sales order item fulfillment
      for (const item of req.body.purchaseInvoiceProduct) {
        const productId = Number(item.product_id);
        const quantity = Number(item.product_quantity);

        // Find matching sales order item
        const salesOrderItem = await prisma.sales_order_item.findFirst({
          where: {
            order_id: sales_order_id,
            product_id: productId,
          },
        });

        if (salesOrderItem) {
          const newFulfilledQty = Math.min(
            salesOrderItem.fulfilled_quantity + quantity,
            salesOrderItem.ordered_quantity
          );

          await prisma.sales_order_item.update({
            where: { id: salesOrderItem.id },
            data: { fulfilled_quantity: newFulfilledQty },
          });
        }
      }

      // Recalculate sales order status
      const salesOrder = await prisma.sales_order.findUnique({
        where: { id: sales_order_id },
        include: { order_items: true },
      });

      if (salesOrder) {
        const allFulfilled = salesOrder.order_items.every(
          item => item.fulfilled_quantity >= item.ordered_quantity
        );
        const allPending = salesOrder.order_items.every(
          item => item.fulfilled_quantity === 0
        );

        let newStatus = "partial";
        if (allFulfilled) newStatus = "fulfilled";
        else if (allPending) newStatus = "pending";

        if (newStatus !== salesOrder.status) {
          await prisma.sales_order.update({
            where: { id: sales_order_id },
            data: { status: newStatus },
          });
        }
      }
    }

    if (purchase_order_id) {
      // Update purchase order item received quantities
      for (const item of req.body.purchaseInvoiceProduct) {
        const productId = Number(item.product_id);
        const quantity = Number(item.product_quantity);

        // Find matching purchase order item
        const purchaseOrderItem = await prisma.purchase_order_item.findFirst({
          where: {
            order_id: purchase_order_id,
            product_id: productId,
          },
        });

        if (purchaseOrderItem) {
          const newReceivedQty = Math.min(
            purchaseOrderItem.received_quantity + quantity,
            purchaseOrderItem.ordered_quantity
          );

          await prisma.purchase_order_item.update({
            where: { id: purchaseOrderItem.id },
            data: { received_quantity: newReceivedQty },
          });
        }
      }

      // Recalculate purchase order status
      const purchaseOrder = await prisma.purchase_order.findUnique({
        where: { id: purchase_order_id },
        include: { order_items: true },
      });

      if (purchaseOrder) {
        const allReceived = purchaseOrder.order_items.every(
          item => item.received_quantity >= item.ordered_quantity
        );
        const allPending = purchaseOrder.order_items.every(
          item => item.received_quantity === 0
        );

        let newStatus = "partial";
        if (allReceived) newStatus = "received";
        else if (allPending) newStatus = "pending";

        if (newStatus !== purchaseOrder.status) {
          await prisma.purchase_order.update({
            where: { id: purchase_order_id },
            data: { status: newStatus },
          });
        }
      }
    }

      res.json({
        createdInvoice,
      });
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const getAllPurchaseInvoice = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }

  if (req.query.query === "info") {
    // get purchase invoice info
    const aggregations = await prisma.purchaseInvoice.aggregate({
      where: {
        company_id: companyId,
      },
      _count: {
        id: true,
      },
      _sum: {
        total_amount: true,
        due_amount: true,
        paid_amount: true,
      },
    });
    res.json(aggregations);
  } else {
    const { skip, limit } = getPagination(req.query);
    try {
      // get purchase invoice with pagination and info
      const [aggregations, purchaseInvoices] = await prisma.$transaction([
        // get info of selected parameter data
        prisma.purchaseInvoice.aggregate({
          _count: {
            id: true,
          },
          _sum: {
            total_amount: true,
            discount: true,
            due_amount: true,
            paid_amount: true,
          },
          where: {
            date: {
              gte: new Date(req.query.startdate),
              lte: new Date(req.query.enddate),
            },
            company_id: companyId,
          },
        }),
        // get purchaseInvoice paginated and by start and end date
        prisma.purchaseInvoice.findMany({
          orderBy: [
            {
              id: "desc",
            },
          ],
          skip: Number(skip),
          take: Number(limit),
          include: {
            supplier: {
              select: {
                name: true,
              },
            },
          },
          where: {
            date: {
              gte: new Date(req.query.startdate),
              lte: new Date(req.query.enddate),
            },
            company_id: companyId,
          },
        }),
      ]);
      // modify data to actual data of purchase invoice's current value by adjusting with transactions and returns
      // get all transactions related to purchase invoice
      const transactions = await prisma.transaction.findMany({
        where: {
          type: "purchase",
          company_id: companyId,
          related_id: {
            in: purchaseInvoices.map((item) => item.id),
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
      });
      // get all transactions related to purchase returns invoice
      const transactions2 = await prisma.transaction.findMany({
        where: {
          type: "purchase_return",
          company_id: companyId,
          related_id: {
            in: purchaseInvoices.map((item) => item.id),
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
      });
      // calculate the discount earned amount at the time of make the payment
      const transactions3 = await prisma.transaction.findMany({
        where: {
          type: "purchase",
          company_id: companyId,
          related_id: {
            in: purchaseInvoices.map((item) => item.id),
          },
          credit_id: 13,
        },
      });
      const returnPurchaseInvoice = await prisma.returnPurchaseInvoice.findMany(
        {
          where: {
            purchaseInvoice_id: {
              in: purchaseInvoices.map((item) => item.id),
            },
          },
        }
      );
      // calculate paid amount and due amount of individual purchase invoice from transactions and returnPurchaseInvoice and attach it to purchaseInvoices
      const allPurchaseInvoice = purchaseInvoices.map((item) => {
        const paidAmount = transactions
          .filter((transaction) => transaction.related_id === item.id)
          .reduce((acc, curr) => acc + curr.amount, 0);
        const paidAmountReturn = transactions2
          .filter((transaction) => transaction.related_id === item.id)
          .reduce((acc, curr) => acc + curr.amount, 0);
        const discountEarned = transactions3
          .filter((transaction) => transaction.related_id === item.id)
          .reduce((acc, curr) => acc + curr.amount, 0);
        const returnAmount = returnPurchaseInvoice
          .filter(
            (returnPurchaseInvoice) =>
              returnPurchaseInvoice.purchaseInvoice_id === item.id
          )
          .reduce((acc, curr) => acc + curr.total_amount, 0);
        return {
          ...item,
          paid_amount: paidAmount,
          discount: item.discount + discountEarned,
          due_amount:
            item.total_amount -
            item.discount -
            paidAmount -
            returnAmount +
            paidAmountReturn -
            discountEarned,
        };
      });
      // calculate total paid_amount and due_amount from allPurchaseInvoice and attach it to aggregations
      const totalPaidAmount = allPurchaseInvoice.reduce(
        (acc, curr) => acc + curr.paid_amount,
        0
      );
      const totalDueAmount = allPurchaseInvoice.reduce(
        (acc, curr) => acc + curr.due_amount,
        0
      );
      const totalDiscountGiven = allPurchaseInvoice.reduce(
        (acc, curr) => acc + curr.discount,
        0
      );
      aggregations._sum.paid_amount = totalPaidAmount;
      aggregations._sum.due_amount = totalDueAmount;
      aggregations._sum.discount = totalDiscountGiven;
      res.json({
        aggregations,
        allPurchaseInvoice,
      });
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  }
};

const getSinglePurchaseInvoice = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // get single purchase invoice information with products
    const singlePurchaseInvoice = await prisma.purchaseInvoice.findUnique({
      where: {
        id: Number(req.params.id),
      },
      include: {
        purchaseInvoiceProduct: {
          include: {
            product: {
              include: {
                book_publisher: true,
              },
            },
            // product_discount: true,
          },
        },
        supplier: true,
      },
    });

    if (!singlePurchaseInvoice) {
      return res.status(404).json({ error: "Purchase invoice not found" });
    }

    // Verify that the purchase invoice belongs to the user's company
    if (singlePurchaseInvoice.company_id !== companyId) {
      return res.status(403).json({ error: "Purchase invoice does not belong to your company" });
    }

    // get all transactions related to this purchase invoice
    const transactions = await prisma.transaction.findMany({
      where: {
        related_id: Number(req.params.id),
        company_id: companyId,
        OR: [
          {
            type: "purchase",
          },
          {
            type: "purchase_return",
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
    // transactions of the paid amount
    const transactions2 = await prisma.transaction.findMany({
      where: {
        type: "purchase",
        company_id: companyId,
        related_id: Number(req.params.id),
        OR: [
          {
            credit_id: 1,
          },
          {
            credit_id: 2,
          },
        ],
      },
    });
    // transactions of the discount earned amount
    const transactions3 = await prisma.transaction.findMany({
      where: {
        type: "purchase",
        company_id: companyId,
        related_id: Number(req.params.id),
        credit_id: 13,
      },
    });
    // transactions of the return purchase invoice's amount
    const transactions4 = await prisma.transaction.findMany({
      where: {
        type: "purchase_return",
        company_id: companyId,
        related_id: Number(req.params.id),
        OR: [
          {
            debit_id: 1,
          },
          {
            debit_id: 2,
          },
        ],
      },
    });
    // get return purchase invoice information with products of this purchase invoice
    const returnPurchaseInvoice = await prisma.returnPurchaseInvoice.findMany({
      where: {
        purchaseInvoice_id: Number(req.params.id),
      },
      include: {
        returnPurchaseInvoiceProduct: {
          include: {
            product: true,
          },
        },
      },
    });
    // sum of total paid amount
    const totalPaidAmount = transactions2.reduce(
      (acc, item) => acc + item.amount,
      0
    );
    // sum of total discount earned amount
    const totalDiscountAmount = transactions3.reduce(
      (acc, item) => acc + item.amount,
      0
    );
    // sum of total return purchase invoice amount
    const paidAmountReturn = transactions4.reduce(
      (acc, curr) => acc + curr.amount,
      0
    );
    // sum total amount of all return purchase invoice related to this purchase invoice
    const totalReturnAmount = returnPurchaseInvoice.reduce(
      (acc, item) => acc + item.total_amount,
      0
    );
    console.log(singlePurchaseInvoice.total_amount);
    console.log(singlePurchaseInvoice.discount);
    console.log(totalPaidAmount);
    console.log(totalDiscountAmount);
    console.log(totalReturnAmount);
    console.log(paidAmountReturn);
    const dueAmount =
      singlePurchaseInvoice.total_amount -
      singlePurchaseInvoice.discount -
      totalPaidAmount -
      totalDiscountAmount -
      totalReturnAmount +
      paidAmountReturn;
    let status = "UNPAID";
    if (dueAmount === 0) {
      status = "PAID";
    }
    res.json({
      status,
      totalPaidAmount,
      totalReturnAmount,
      dueAmount,
      singlePurchaseInvoice,
      returnPurchaseInvoice,
      transactions,
    });
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

module.exports = {
  createSinglePurchaseInvoice,
  getAllPurchaseInvoice,
  getSinglePurchaseInvoice,
};
