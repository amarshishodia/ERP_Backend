const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const createSingleChallan = async (req, res) => {
  try {
    // Resolve company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ message: "User company not found" });
    }

    // Check if invoice number is already taken
    const existingChallan = await prisma.challanInvoice.findFirst({
      where: {
        company_id: companyId,
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

    if (existingChallan && existingChallan.prefix === req.body.prefix) {
      return res.status(400).json({ message: 'Invoice number is already taken.' });
    }

    // Step 1: Handle new products (products with ISBN but no product_id)
    const productIdMap = new Map(); // Map ISBN to product_id
    const newProducts = req.body.saleInvoiceProduct.filter(item => item.isbn && !item.product_id);
    
    // Create new products if any
    for (const item of newProducts) {
      if (!item.product_data || !item.product_data.isbn) continue;
      
      const productData = item.product_data;
      
      // Check if product already exists by ISBN (in case of race condition)
      let existingProduct = await prisma.product.findFirst({
        where: { isbn: productData.isbn, company_id: companyId },
      });
      
      if (existingProduct) {
        productIdMap.set(productData.isbn, existingProduct.id);
        continue;
      }
      
      // Handle publisher - create if doesn't exist
      let publisherId = productData.book_publisher_id;
      if (!publisherId && productData.publisher_name) {
        let publisher = await prisma.book_publisher.findFirst({
          where: { name: productData.publisher_name, company_id: companyId },
        });
        
        if (!publisher) {
          publisher = await prisma.book_publisher.create({
            data: { name: productData.publisher_name, company_id: companyId },
          });
        }
        publisherId = publisher.id;
      }
      
      // Prepare product data
      const newProductData = {
        isbn: productData.isbn,
        name: productData.name || "",
        author: productData.author || null,
        sale_price: parseFloat(productData.sale_price) || 0,
        purchase_price: parseFloat(productData.purchase_price) || 0,
        quantity: parseInt(productData.quantity) || 0,
        unit_measurement: parseFloat(productData.unit_measurement) || 0,
        unit_type: productData.unit_type || "",
        company_id: companyId,
      };
      
      // Connect currency (required field)
      if (productData.product_currency_id) {
        newProductData.product_currency = {
          connect: { id: Number(productData.product_currency_id) },
        };
      }
      
      // Connect publisher if available
      if (publisherId) {
        newProductData.book_publisher = {
          connect: { id: Number(publisherId) },
        };
      }
      
      // Connect category if available
      if (productData.product_category_id) {
        newProductData.product_category = {
          connect: { id: Number(productData.product_category_id) },
        };
      }
      
      // Create the new product
      const createdProduct = await prisma.product.create({
        data: newProductData,
      });
      
      productIdMap.set(productData.isbn, createdProduct.id);
    }
    
    // Step 2: Verify products with product_id belong to the company
    const productIds = req.body.saleInvoiceProduct
      .filter(item => item.product_id)
      .map(item => Number(item.product_id));
    
    if (productIds.length > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, company_id: true },
      });

      const invalidProducts = products.filter(p => p.company_id !== companyId);
      if (invalidProducts.length > 0) {
        return res.status(403).json({ error: "Some products do not belong to your company" });
      }
    }

    // Step 3: Map all products to their IDs
    const processedProducts = req.body.saleInvoiceProduct.map((item) => {
      if (item.product_id) {
        return { ...item, final_product_id: Number(item.product_id) };
      } else if (item.isbn && productIdMap.has(item.isbn)) {
        return { ...item, final_product_id: productIdMap.get(item.isbn) };
      } else {
        throw new Error(`Product not found for ISBN: ${item.isbn || 'N/A'}. Please ensure all products have a valid product_id or ISBN.`);
      }
    });

    // Step 4: Calculate totals
    let totalSalePrice = 0;
    let totalProductDiscount = 0;
    let totalProductQty = 0;

    processedProducts.forEach((item) => {
      totalSalePrice +=
        parseFloat(item.product_sale_price) *
        parseFloat(item.product_quantity) *
        parseFloat(item.product_sale_conversion);

      totalProductDiscount +=
        (parseFloat(item.product_sale_price) *
          parseFloat(item.product_quantity) *
          parseFloat(item.product_sale_conversion) *
          parseFloat(item.product_sale_discount || 0)) /
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

    // Create challan invoice
    const createdChallan = await prisma.challanInvoice.create({
      data: {
        date: new Date(date),
        total_amount: totalSalePrice,
        discount: additionalDiscount,
        total_product_discount: totalProductDiscount,
        total_product_qty: totalProductQty,
        round_off_enabled: roundOffEnabled,
        round_off_amount: roundOffAmount,
        company: {
          connect: { id: companyId },
        },
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
        challanInvoiceProduct: {
          create: processedProducts.map((product) => ({
            product: {
              connect: {
                id: product.final_product_id,
              },
            },
            product_quantity: Number(product.product_quantity),
            product_sale_price: parseFloat(product.product_sale_price),
            product_sale_discount: parseFloat(product.product_sale_discount || 0),
            product_sale_currency: product.product_sale_currency,
            product_sale_conversion: parseFloat(product.product_sale_conversion),
          })),
        },
      },
    });

    // Decrease product quantity for challan (but NO financial transactions)
    await Promise.all(
      processedProducts.map((item) =>
        prisma.product.update({
          where: {
            id: item.final_product_id,
          },
          data: {
            quantity: {
              decrement: Number(item.product_quantity),
            },
          },
        })
      )
    );

    res.json({
      createdChallan,
    });
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const getAllChallan = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ message: "User company not found" });
    }

    const { skip, limit } = getPagination(req.query);
    const startdate = req.query.startdate;
    const enddate = req.query.enddate;

    const challans = await prisma.challanInvoice.findMany({
      where: {
        date: {
          gte: new Date(startdate),
          lte: new Date(enddate),
        },
        company_id: companyId,
      },
      include: {
        customer: true,
        user: true,
        challanInvoiceProduct: {
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
    res.json(challans);
  } catch (error) {
    console.log("getAllChallan error:", error.message);
    res.status(400).json(error.message);
  }
};

const getSingleChallan = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ message: "User company not found" });
    }

    const challan = await prisma.challanInvoice.findFirst({
      where: {
        id: Number(req.params.id),
        company_id: companyId,
      },
      include: {
        customer: true,
        user: true,
        challanInvoiceProduct: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!challan) {
      return res.status(404).json({ message: "Challan not found" });
    }

    res.json(challan);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const convertChallanToSale = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ message: "User company not found" });
    }

    const challanId = Number(req.params.id);
    
    // Get challan details
    const challan = await prisma.challanInvoice.findFirst({
      where: { 
        id: challanId,
        company_id: companyId,
      },
      include: {
        customer: true,
        user: true,
        challanInvoiceProduct: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!challan) {
      return res.status(404).json({ message: "Challan not found" });
    }

    // Get the next sale invoice number
    const allSales = await prisma.saleInvoice.findMany({
      where: { company_id: companyId },
      orderBy: { invoice_number: "desc" },
      take: 1,
    });
    
    const nextInvoiceNumber = allSales.length > 0 
      ? allSales[0].invoice_number + 1 
      : 1;

    // Convert challan to sale
    const challanProducts = challan.challanInvoiceProduct;
    const saleProducts = challanProducts.map((item) => ({
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
        return await prisma.product.findFirst({
          where: { id: item.product_id, company_id: companyId },
        });
      })
    );

    saleProducts.forEach((item, index) => {
      totalPurchasePrice += allProduct[index].purchase_price * item.product_quantity;
    });

    const subtotalAfterProductDiscounts = totalSalePrice - totalProductDiscount;
    const additionalDiscount = parseFloat(challan.discount) || 0;
    const roundOffAmount = parseFloat(challan.round_off_amount) || 0;
    const roundOffEnabled = challan.round_off_enabled || false;
    const finalTotal = subtotalAfterProductDiscounts - additionalDiscount + roundOffAmount;
    const paidAmount = parseFloat(req.body.paid_amount) || 0;
    const dueAmount = finalTotal - paidAmount;

    const date = new Date(challan.date).toISOString().split("T")[0];

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
        company: {
          connect: { id: companyId },
        },
        customer: {
          connect: { id: challan.customer_id },
        },
        user: {
          connect: { id: challan.user_id },
        },
        note: challan.note,
        invoice_number: nextInvoiceNumber,
        invoice_order_date: challan.invoice_order_date,
        invoice_order_number: challan.invoice_order_number,
        prefix: challan.prefix,
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
          company: {
            connect: { id: companyId },
          },
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
          company: {
            connect: { id: companyId },
          },
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
        company: {
          connect: { id: companyId },
        },
      },
    });

    // Note: Stock quantity was already decreased when challan was created
    // So no need to decrease again

    res.json({
      createdSale,
    });
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const updateSingleChallan = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ message: "User company not found" });
    }

    // Check if the challan exists and belongs to the user's company
    const existingChallan = await prisma.challanInvoice.findFirst({
      where: {
        id: Number(req.params.id),
        company_id: companyId,
      },
    });

    if (!existingChallan) {
      return res.status(404).json({ message: "Challan not found." });
    }

    // Check if the invoice number is being updated to one that already exists
    if (
      existingChallan.invoice_number !== Number(req.body.invoiceNumber) &&
      (await prisma.challanInvoice.findFirst({
        where: {
          company_id: companyId,
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

    // Step 1: Handle new products before update (similar to create)
    const updateProductIdMap = new Map();
    const updateNewProducts = req.body.saleInvoiceProduct.filter(item => item.isbn && !item.product_id);
    
    for (const item of updateNewProducts) {
      if (!item.product_data || !item.product_data.isbn) continue;
      
      const productData = item.product_data;
      
      let existingProduct = await prisma.product.findFirst({
        where: { isbn: productData.isbn, company_id: companyId }
      });
      
      if (existingProduct) {
        updateProductIdMap.set(productData.isbn, existingProduct.id);
        continue;
      }
      
      let publisherId = productData.book_publisher_id;
      if (!publisherId && productData.publisher_name) {
        let publisher = await prisma.book_publisher.findFirst({
          where: { name: productData.publisher_name, company_id: companyId }
        });
        
        if (!publisher) {
          publisher = await prisma.book_publisher.create({
            data: { name: productData.publisher_name, company_id: companyId }
          });
        }
        publisherId = publisher.id;
      }
      
      const newProductData = {
        isbn: productData.isbn,
        name: productData.name || "",
        author: productData.author || null,
        sale_price: parseFloat(productData.sale_price) || 0,
        purchase_price: parseFloat(productData.purchase_price) || 0,
        quantity: parseInt(productData.quantity) || 0,
        unit_measurement: parseFloat(productData.unit_measurement) || 0,
        unit_type: productData.unit_type || "",
        company_id: companyId,
      };
      
      if (productData.product_currency_id) {
        newProductData.product_currency = {
          connect: { id: Number(productData.product_currency_id) }
        };
      }
      
      if (publisherId) {
        newProductData.book_publisher = {
          connect: { id: Number(publisherId) }
        };
      }
      
      if (productData.product_category_id) {
        newProductData.product_category = {
          connect: { id: Number(productData.product_category_id) }
        };
      }
      
      const createdProduct = await prisma.product.create({
        data: newProductData
      });
      
      updateProductIdMap.set(productData.isbn, createdProduct.id);
    }
    
    // Step 2: Verify products with product_id belong to the company
    const updateProductIds = req.body.saleInvoiceProduct
      .filter(item => item.product_id)
      .map(item => Number(item.product_id));
    
    if (updateProductIds.length > 0) {
      const updateProducts = await prisma.product.findMany({
        where: { id: { in: updateProductIds } },
        select: { id: true, company_id: true },
      });

      const invalidUpdateProducts = updateProducts.filter(p => p.company_id !== companyId);
      if (invalidUpdateProducts.length > 0) {
        return res.status(403).json({ error: "Some products do not belong to your company" });
      }
    }

    // Step 3: Map all products to their IDs
    const updateProcessedProducts = req.body.saleInvoiceProduct.map((item) => {
      if (item.product_id) {
        return { ...item, final_product_id: Number(item.product_id) };
      } else if (item.isbn && updateProductIdMap.has(item.isbn)) {
        return { ...item, final_product_id: updateProductIdMap.get(item.isbn) };
      } else {
        throw new Error(`Product not found for ISBN: ${item.isbn || 'N/A'}. Please ensure all products have a valid product_id or ISBN.`);
      }
    });

    // Get previous challan products to restore stock
    const previousChallanProducts = await prisma.challanInvoice.findFirst({
      where: { id: Number(req.params.id), company_id: companyId },
      include: { challanInvoiceProduct: true },
    });

    // Restore stock from previous products (async properly)
    if (previousChallanProducts && previousChallanProducts.challanInvoiceProduct) {
      await Promise.all(
        previousChallanProducts.challanInvoiceProduct.map((item) =>
          prisma.product.update({
            where: { id: item.product_id },
            data: {
              quantity: {
                increment: item.product_quantity,
              },
            },
          })
        )
      );
    }

    // Update the challan invoice (affects stock but not financial transactions)
    const updatedChallan = await prisma.challanInvoice.update({
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
        challanInvoiceProduct: {
          deleteMany: {},
          create: updateProcessedProducts.map((product) => ({
            product: {
              connect: {
                id: product.final_product_id,
              },
            },
            product_quantity: Number(product.product_quantity),
            product_sale_price: parseFloat(product.product_sale_price),
            product_sale_discount: parseFloat(product.product_sale_discount || 0),
            product_sale_currency: product.product_sale_currency,
            product_sale_conversion: parseFloat(product.product_sale_conversion),
          })),
        },
      },
      include: {
        customer: true,
        user: true,
        challanInvoiceProduct: {
          include: {
            product: true,
          },
        },
      },
    });

    // Decrement stock for new products (challan affects stock)
    await Promise.all(
      updateProcessedProducts.map((item) =>
        prisma.product.update({
          where: {
            id: item.final_product_id,
          },
          data: {
            quantity: {
              decrement: Number(item.product_quantity),
            },
          },
        })
      )
    );

    res.json({
      updatedChallan,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
    console.log(error.message);
  }
};

module.exports = {
  createSingleChallan,
  getAllChallan,
  getSingleChallan,
  convertChallanToSale,
  updateSingleChallan,
};

