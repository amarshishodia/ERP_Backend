const { getPagination } = require("../../../utils/query");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const createSingleQuotation = async (req, res) => {
  try {
    // Check if invoice number is already taken
    const existingQuotation = await prisma.quotationInvoice.findFirst({
      where: {
        OR: [
          {
            prefix: req.body.prefix,
            invoice_number: Number(req.body.invoiceNumber),
          },
          {
            invoice_number: Number(req.body.invoiceNumber),
          },
        ],
      },
    });

    if (existingQuotation && existingQuotation.prefix === req.body.prefix) {
      return res.status(400).json({ message: 'Invoice number is already taken.' });
    }

    // Calculate totals
    let totalSalePrice = 0;
    let totalProductDiscount = 0;
    let totalProductQty = 0;

    req.body.saleInvoiceProduct.forEach((item) => {
      totalSalePrice +=
        parseFloat(item.product_sale_price) *
        parseFloat(item.product_quantity) *
        parseFloat(item.product_sale_conversion);

      totalProductDiscount +=
        (parseFloat(item.product_sale_price) *
          parseFloat(item.product_quantity) *
          parseFloat(item.product_sale_conversion) *
          parseFloat(item.product_sale_discount)) /
        100;

      totalProductQty += parseInt(item.product_quantity);
    });

    // Calculate final totals with round off
    const subtotalAfterProductDiscounts = totalSalePrice - totalProductDiscount;
    const additionalDiscount = parseFloat(req.body.discount) || 0;
    const roundOffAmount = parseFloat(req.body.round_off_amount) || 0;
    const roundOffEnabled = req.body.round_off_enabled || false;

    // Convert date
    const date = new Date(req.body.date).toISOString().split("T")[0];

    // Create quotation invoice
    const createdQuotation = await prisma.quotationInvoice.create({
      data: {
        date: new Date(date),
        total_amount: totalSalePrice,
        discount: additionalDiscount,
        total_product_discount: totalProductDiscount,
        total_product_qty: totalProductQty,
        round_off_enabled: roundOffEnabled,
        round_off_amount: roundOffAmount,
        customer: {
          connect: {
            id: Number(req.body.customer_id),
          },
        },
        user: {
          connect: {
            id: Number(req.body.user_id),
          },
        },
        note: req.body.note,
        invoice_number: Number(req.body.invoiceNumber),
        invoice_order_date: req.body.orderDate,
        invoice_order_number: req.body.orderNumber,
        prefix: req.body.prefix,
        quotationInvoiceProduct: {
          create: req.body.saleInvoiceProduct.map((product) => ({
            product: {
              connect: {
                id: Number(product.product_id),
              },
            },
            product_quantity: Number(product.product_quantity),
            product_sale_price: parseFloat(product.product_sale_price),
            product_sale_discount: parseFloat(product.product_sale_discount),
            product_sale_currency: product.product_sale_currency,
            product_sale_conversion: parseFloat(
              product.product_sale_conversion
            ),
          })),
        },
      },
    });

    // NO stock changes, NO financial transactions for quotation
    res.json({
      createdQuotation,
    });
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const getAllQuotation = async (req, res) => {
  try {
    const { skip, limit } = getPagination(req.query);
    const startdate = req.query.startdate;
    const enddate = req.query.enddate;

    const quotations = await prisma.quotationInvoice.findMany({
      where: {
        date: {
          gte: new Date(startdate),
          lte: new Date(enddate),
        },
      },
      include: {
        customer: true,
        user: true,
        quotationInvoiceProduct: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        id: "desc",
      },
      skip: Number(skip),
      take: Number(limit),
    });

    // Return in the same format as sale invoice
    res.json(quotations);
  } catch (error) {
    console.log("getAllQuotation error:", error.message);
    res.status(400).json(error.message);
  }
};

const getSingleQuotation = async (req, res) => {
  try {
    const quotation = await prisma.quotationInvoice.findUnique({
      where: {
        id: Number(req.params.id),
      },
      include: {
        customer: true,
        user: true,
        quotationInvoiceProduct: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!quotation) {
      return res.status(404).json({ message: "Quotation not found" });
    }

    res.json(quotation);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const convertQuotationToSale = async (req, res) => {
  try {
    const quotationId = Number(req.params.id);
    
    // Get quotation details
    const quotation = await prisma.quotationInvoice.findUnique({
      where: { id: quotationId },
      include: {
        customer: true,
        user: true,
        quotationInvoiceProduct: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!quotation) {
      return res.status(404).json({ message: "Quotation not found" });
    }

    // Get the next sale invoice number
    const allSales = await prisma.saleInvoice.findMany({
      orderBy: { invoice_number: 'desc' },
      take: 1,
    });
    
    const nextInvoiceNumber = allSales.length > 0 
      ? allSales[0].invoice_number + 1 
      : 1;

    // Convert quotation to sale
    const quotationProducts = quotation.quotationInvoiceProduct;
    const saleProducts = quotationProducts.map((item) => ({
      product_id: item.product_id,
      product_quantity: item.product_quantity,
      product_sale_price: item.product_sale_price,
      product_sale_discount: item.product_sale_discount,
      product_sale_currency: item.product_sale_currency,
      product_sale_conversion: item.product_sale_conversion,
    }));

    // Calculate totals
    let totalSalePrice = 0;
    let totalProductDiscount = 0;
    let totalProductQty = 0;
    let totalPurchasePrice = 0;

    saleProducts.forEach((item) => {
      totalSalePrice +=
        parseFloat(item.product_sale_price) *
        parseFloat(item.product_quantity) *
        parseFloat(item.product_sale_conversion);

      totalProductDiscount +=
        (parseFloat(item.product_sale_price) *
          parseFloat(item.product_quantity) *
          parseFloat(item.product_sale_conversion) *
          parseFloat(item.product_sale_discount)) /
        100;

      totalProductQty += parseInt(item.product_quantity);
    });

    // Get products for purchase price calculation
    const allProduct = await Promise.all(
      saleProducts.map(async (item) => {
        return await prisma.product.findUnique({
          where: { id: item.product_id },
        });
      })
    );

    saleProducts.forEach((item, index) => {
      totalPurchasePrice += allProduct[index].purchase_price * item.product_quantity;
    });

    const subtotalAfterProductDiscounts = totalSalePrice - totalProductDiscount;
    const additionalDiscount = parseFloat(quotation.discount) || 0;
    const roundOffAmount = parseFloat(quotation.round_off_amount) || 0;
    const roundOffEnabled = quotation.round_off_enabled || false;
    const finalTotal = subtotalAfterProductDiscounts - additionalDiscount + roundOffAmount;
    const paidAmount = parseFloat(req.body.paid_amount) || 0;
    const dueAmount = finalTotal - paidAmount;

    const date = new Date(quotation.date).toISOString().split("T")[0];

    // Create sale invoice
    const createdSale = await prisma.saleInvoice.create({
      data: {
        date: new Date(date),
        total_amount: totalSalePrice,
        discount: additionalDiscount,
        paid_amount: paidAmount,
        total_product_discount: totalProductDiscount,
        total_product_qty: totalProductQty,
        round_off_enabled: roundOffEnabled,
        round_off_amount: roundOffAmount,
        profit: totalSalePrice - totalProductDiscount - additionalDiscount - totalPurchasePrice,
        due_amount: dueAmount,
        customer: {
          connect: { id: quotation.customer_id },
        },
        user: {
          connect: { id: quotation.user_id },
        },
        note: quotation.note,
        invoice_number: nextInvoiceNumber,
        invoice_order_date: quotation.invoice_order_date,
        invoice_order_number: quotation.invoice_order_number,
        prefix: quotation.prefix,
        saleInvoiceProduct: {
          create: saleProducts.map((product) => ({
            product: { connect: { id: Number(product.product_id) } },
            product_quantity: Number(product.product_quantity),
            product_sale_price: parseFloat(product.product_sale_price),
            product_sale_discount: parseFloat(product.product_sale_discount),
            product_sale_currency: product.product_sale_currency,
            product_sale_conversion: parseFloat(product.product_sale_conversion),
          })),
        },
      },
    });

    // Create financial transactions
    if (paidAmount > 0) {
      await prisma.transaction.create({
        data: {
          date: new Date(date),
          debit_id: 1,
          credit_id: 8,
          amount: paidAmount,
          particulars: `Cash receive on Sale Invoice #${createdSale.id}`,
          type: "sale",
          related_id: createdSale.id,
        },
      });
    }

    if (dueAmount > 0) {
      await prisma.transaction.create({
        data: {
          date: new Date(date),
          debit_id: 4,
          credit_id: 8,
          amount: dueAmount,
          particulars: `Due on Sale Invoice #${createdSale.id}`,
          type: "sale",
          related_id: createdSale.id,
        },
      });
    }

    await prisma.transaction.create({
      data: {
        date: new Date(date),
        debit_id: 9,
        credit_id: 3,
        amount: totalPurchasePrice,
        particulars: `Cost of sales on Sale Invoice #${createdSale.id}`,
        type: "sale",
        related_id: createdSale.id,
      },
    });

    // Decrease product quantities
    saleProducts.forEach(async (item) => {
      await prisma.product.update({
        where: { id: Number(item.product_id) },
        data: { quantity: { decrement: Number(item.product_quantity) } },
      });
    });

    res.json({
      createdSale,
    });
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const updateSingleQuotation = async (req, res) => {
  try {
    // Check if the quotation exists
    const existingQuotation = await prisma.quotationInvoice.findUnique({
      where: {
        id: Number(req.params.id),
      },
    });

    if (!existingQuotation) {
      return res.status(404).json({ message: 'Quotation not found.' });
    }

    // Check if the invoice number is being updated to one that already exists
    if (
      existingQuotation.invoice_number !== Number(req.body.invoiceNumber) &&
      (await prisma.quotationInvoice.findFirst({
        where: {
          OR: [
            {
              prefix: req.body.prefix,
              invoice_number: Number(req.body.invoiceNumber),
            },
            {
              invoice_number: Number(req.body.invoiceNumber),
            },
          ],
        },
      }))
    ) {
      return res.status(400).json({ message: 'Invoice number is already taken.' });
    }

    // Calculate totals
    let totalSalePrice = 0;
    let totalProductDiscount = 0;
    let totalProductQty = 0;

    req.body.saleInvoiceProduct.forEach((item) => {
      totalSalePrice +=
        parseFloat(item.product_sale_price) *
        parseFloat(item.product_quantity) *
        parseFloat(item.product_sale_conversion);

      totalProductDiscount +=
        (parseFloat(item.product_sale_price) *
          parseFloat(item.product_quantity) *
          parseFloat(item.product_sale_conversion) *
          parseFloat(item.product_sale_discount)) /
        100;

      totalProductQty += parseInt(item.product_quantity);
    });

    // Convert date
    const date = new Date(req.body.date).toISOString().split('T')[0];

    // Calculate final totals with round off
    const roundOffAmount = parseFloat(req.body.round_off_amount) || 0;
    const roundOffEnabled = req.body.round_off_enabled || false;

    // Update the quotation invoice (no stock or financial changes)
    const updatedQuotation = await prisma.quotationInvoice.update({
      where: {
        id: Number(req.params.id),
      },
      data: {
        date: new Date(date),
        total_amount: totalSalePrice,
        discount: parseFloat(req.body.discount) || 0,
        total_product_discount: totalProductDiscount,
        total_product_qty: totalProductQty,
        round_off_enabled: roundOffEnabled,
        round_off_amount: roundOffAmount,
        customer: {
          connect: {
            id: Number(req.body.customer_id),
          },
        },
        user: {
          connect: {
            id: Number(req.body.user_id),
          },
        },
        note: req.body.note,
        invoice_number: Number(req.body.invoiceNumber),
        invoice_order_date: req.body.orderDate,
        invoice_order_number: req.body.orderNumber,
        prefix: req.body.prefix,
        // Update the related products
        quotationInvoiceProduct: {
          deleteMany: {},
          create: req.body.saleInvoiceProduct.map((product) => ({
            product: {
              connect: {
                id: Number(product.product_id),
              },
            },
            product_quantity: Number(product.product_quantity),
            product_sale_price: parseFloat(product.product_sale_price),
            product_sale_discount: parseFloat(product.product_sale_discount),
            product_sale_currency: product.product_sale_currency,
            product_sale_conversion: parseFloat(product.product_sale_conversion),
          })),
        },
      },
      include: {
        customer: true,
        user: true,
        quotationInvoiceProduct: {
          include: {
            product: true,
          },
        },
      },
    });

    res.json({
      updatedQuotation,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
    console.log(error.message);
  }
};

module.exports = {
  createSingleQuotation,
  getAllQuotation,
  getSingleQuotation,
  convertQuotationToSale,
  updateSingleQuotation,
};

