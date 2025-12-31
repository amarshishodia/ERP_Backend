const { getPagination } = require("../../../utils/query");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { createTransactionWithSubAccounts } = require("../../../utils/transactionHelper");

const createSingleSaleInvoice = async (req, res) => {
  try {
    
    // Check if invoice number is already taken
    const existingInvoice = await prisma.saleInvoice.findFirst({
    //   where: {
    //     invoice_number: Number(req.body.invoiceNumber),
    //   },
    // });

    // if (existingInvoice) {
    //   return res.status(400).json({ message: 'Invoice number is already taken.' });
    // }
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

  if (existingInvoice && existingInvoice.prefix === req.body.prefix) {
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
        where: { isbn: productData.isbn }
      });
      
      if (existingProduct) {
        productIdMap.set(productData.isbn, existingProduct.id);
        continue;
      }
      
      // Handle publisher - create if doesn't exist
      let publisherId = productData.book_publisher_id;
      if (!publisherId && productData.publisher_name) {
        let publisher = await prisma.book_publisher.findFirst({
          where: { name: productData.publisher_name }
        });
        
        if (!publisher) {
          publisher = await prisma.book_publisher.create({
            data: { name: productData.publisher_name }
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
      };
      
      // Connect currency (required field)
      if (productData.product_currency_id) {
        newProductData.product_currency = {
          connect: { id: Number(productData.product_currency_id) }
        };
      }
      
      // Connect publisher if available
      if (publisherId) {
        newProductData.book_publisher = {
          connect: { id: Number(publisherId) }
        };
      }
      
      // Connect category if available
      if (productData.product_category_id) {
        newProductData.product_category = {
          connect: { id: Number(productData.product_category_id) }
        };
      }
      
      // Create the new product
      const createdProduct = await prisma.product.create({
        data: newProductData
      });
      
      productIdMap.set(productData.isbn, createdProduct.id);
    }
    
    // Step 2: Map all products to their IDs
    const processedProducts = req.body.saleInvoiceProduct.map((item) => {
      if (item.product_id) {
        return { ...item, final_product_id: Number(item.product_id) };
      } else if (item.isbn && productIdMap.has(item.isbn)) {
        return { ...item, final_product_id: productIdMap.get(item.isbn) };
      } else {
        throw new Error(`Product not found for ISBN: ${item.isbn}`);
      }
    });

    // Step 3: Calculate totals
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
    const finalTotal = subtotalAfterProductDiscounts - additionalDiscount + roundOffAmount;
    const paidAmount = parseFloat(req.body.paid_amount) || 0;
    const dueAmount = finalTotal - paidAmount;
    
    // Step 4: Get all products for purchase price calculation
    const allProduct = await Promise.all(
      processedProducts.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: {
            id: item.final_product_id,
          },
        });
        return product;
      })
    );
    
    // Calculate total purchase price
    let totalPurchasePrice = 0;
    processedProducts.forEach((item, index) => {
      if (allProduct[index] && allProduct[index].purchase_price) {
      totalPurchasePrice +=
          (allProduct[index].purchase_price || 0) * item.product_quantity;
      }
    });
    // convert all incoming date to a specific format.
    const date = new Date(req.body.date).toISOString().split("T")[0];
    // create sale invoice
    const createdInvoice = await prisma.saleInvoice.create({
      data: {
        date: new Date(date),
        total_amount: totalSalePrice,
        discount: additionalDiscount,
        paid_amount: paidAmount,
        total_product_discount: totalProductDiscount,
        total_product_qty: totalProductQty,
        round_off_enabled: roundOffEnabled,
        round_off_amount: roundOffAmount,
        profit:
          totalSalePrice -
          totalProductDiscount -
          additionalDiscount -
          totalPurchasePrice,
        due_amount: dueAmount,
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
        invoice_number: Number(req.body.invoiceNumber), // to save invoice Number
        invoice_order_date: req.body.orderDate,
        // invoice_order_date: new Date(req.body.orderDate),
        invoice_order_number: req.body.orderNumber,
        prefix: req.body.prefix,
        // map and save all products from processed products array
        saleInvoiceProduct: {
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
            product_sale_conversion: parseFloat(
              product.product_sale_conversion
            ),
          })),
        },
      },
    });
    // new transactions will be created as journal entry for paid amount
    if (paidAmount > 0) {
      await createTransactionWithSubAccounts({
        date: new Date(date),
        sub_debit_id: 1, // Cash
        sub_credit_id: 8, // Sales
        amount: paidAmount,
        particulars: `Cash receive on Sale Invoice #${createdInvoice.id}`,
        type: "sale",
        related_id: createdInvoice.id,
      });
    }
    // if sale on due another transactions will be created as journal entry
    if (dueAmount > 0) {
      await createTransactionWithSubAccounts({
        date: new Date(date),
        sub_debit_id: 4, // Accounts Receivable
        sub_credit_id: 8, // Sales
        amount: dueAmount,
        particulars: `Due on Sale Invoice #${createdInvoice.id}`,
        type: "sale",
        related_id: createdInvoice.id,
      });
    }
    // cost of sales will be created as journal entry
    await createTransactionWithSubAccounts({
      date: new Date(date),
      sub_debit_id: 9, // Cost of Sales
      sub_credit_id: 3, // Inventory
      amount: totalPurchasePrice,
      particulars: `Cost of sales on Sale Invoice #${createdInvoice.id}`,
      type: "sale",
      related_id: createdInvoice.id,
    });
    // iterate through all products of this sale invoice and decrease product quantity
    processedProducts.forEach(async (item) => {
      await prisma.product.update({
        where: {
          id: item.final_product_id,
        },
        data: {
          quantity: {
            decrement: Number(item.product_quantity),
          },
        },
      });
    }),
      res.json({
        createdInvoice,
      });
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};



const getAllSaleInvoice = async (req, res) => {
  if (req.query.query === "info") {
    const aggregations = await prisma.saleInvoice.aggregate({
      _count: {
        id: true,
      },
      _sum: {
        total_amount: true,
        total_product_discount: true,
        total_product_qty: true,
        discount: true,
        due_amount: true,
        paid_amount: true,
        profit: true,
      },
    });
    res.json(aggregations);
  } else {
    const { skip, limit } = getPagination(req.query);
    try {
      let aggregations, saleInvoices;
      if (req.query.user) {
        if (req.query.count) {
          [aggregations, saleInvoices] = await prisma.$transaction([
            // get info of selected parameter data
            prisma.saleInvoice.aggregate({
              _count: {
                id: true,
              },
              _sum: {
                total_amount: true,
                total_product_discount: true,
        total_product_qty: true,
                discount: true,
                due_amount: true,
                paid_amount: true,
                profit: true,
              },

              where: {
                date: {
                  gte: new Date(req.query.startdate),
                  lte: new Date(req.query.enddate),
                },
                user_id: Number(req.query.user),
              },
            }),
            // get saleInvoice paginated and by start and end date
            prisma.saleInvoice.findMany({
              orderBy: [
                {
                  id: "desc",
                },
              ],
              skip: Number(skip),
              take: Number(limit),
              include: {
                saleInvoiceProduct: {
                  include: {
                    product: true,
                    // to add publisher name to state
                    // book_publisher: {
                    //   select: {
                    //     id: true,
                    //     name: true
                    //   }
                    // }
                  },
                },
                book_publisher: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                customer: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                user: {
                  select: {
                    id: true,
                    username: true,
                  },
                },
              },
              where: {
                date: {
                  gte: new Date(req.query.startdate),
                  lte: new Date(req.query.enddate),
                },
                user_id: Number(req.query.user),
              },
            }),
          ]);
        } else {
          [aggregations, saleInvoices] = await prisma.$transaction([
            // get info of selected parameter data
            prisma.saleInvoice.aggregate({
              _count: {
                id: true,
              },
              _sum: {
                total_amount: true,
                total_product_discount: true,
        total_product_qty: true,
                discount: true,
                due_amount: true,
                paid_amount: true,
                profit: true,
              },

              where: {
                date: {
                  gte: new Date(req.query.startdate),
                  lte: new Date(req.query.enddate),
                },
                user_id: Number(req.query.user),
              },
            }),
            // get saleInvoice paginated and by start and end date
            prisma.saleInvoice.findMany({
              orderBy: [
                {
                  id: "desc",
                },
              ],
              include: {
                saleInvoiceProduct: {
                  include: {
                    product: true,
                    // book_publisher: {
                    //   select: {
                    //     id: true,
                    //     name: true
                    //   }
                    // }
                  },
                },
                book_publisher: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                customer: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                user: {
                  select: {
                    id: true,
                    username: true,
                  },
                },
              },
              where: {
                date: {
                  gte: new Date(req.query.startdate),
                  lte: new Date(req.query.enddate),
                },
                user_id: Number(req.query.user),
              },
            }),
          ]);
        }
      } else {
        if (req.query.count) {
          [aggregations, saleInvoices] = await prisma.$transaction([
            // get info of selected parameter data
            prisma.saleInvoice.aggregate({
              _count: {
                id: true,
              },
              _sum: {
                total_amount: true,
                total_product_discount: true,
        total_product_qty: true,
        discount: true,
                due_amount: true,
                paid_amount: true,
                profit: true,
              },

              where: {
                date: {
                  gte: new Date(req.query.startdate),
                  lte: new Date(req.query.enddate),
                },
              },
            }),
            // get saleInvoice paginated and by start and end date
            prisma.saleInvoice.findMany({
              orderBy: [
                {
                  id: "desc",
                },
              ],
              skip: Number(skip),
              take: Number(limit),
              include: {
                saleInvoiceProduct: {
                  include: {
                    product: true,
                    // book_publisher: {
                    //   select: {
                    //     id: true,
                    //     name: true
                    //   }
                    // }
                  },
                },
                // book_publisher: {
                //   select: {
                //     id: true,
                //     name: true
                //   }
                // },
                customer: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                user: {
                  select: {
                    id: true,
                    username: true,
                  },
                },
              },
              where: {
                date: {
                  gte: new Date(req.query.startdate),
                  lte: new Date(req.query.enddate),
                },
              },
            }),
          ]);
        } else {
          [aggregations, saleInvoices] = await prisma.$transaction([
            // get info of selected parameter data
            prisma.saleInvoice.aggregate({
              _count: {
                id: true,
              },
              _sum: {
                total_amount: true,
                total_product_discount: true,
        total_product_qty: true,
        discount: true,
                due_amount: true,
                paid_amount: true,
                profit: true,
              },

              where: {
                date: {
                  gte: new Date(req.query.startdate),
                  lte: new Date(req.query.enddate),
                },
              },
            }),
            // get saleInvoice paginated and by start and end date
            prisma.saleInvoice.findMany({
              orderBy: [
                {
                  id: "desc",
                },
              ],
              include: {
                saleInvoiceProduct: {
                  include: {
                    product: true,
                    // book_publisher: {
                    //   select: {
                    //     id: true,
                    //     name: true
                    //   }
                    // }
                  },
                },
                // book_publisher: {
                //   select: {
                //     id: true,
                //     name: true,
                //   },
                // },
                customer: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                user: {
                  select: {
                    id: true,
                    username: true,
                  },
                },
              },
              where: {
                date: {
                  gte: new Date(req.query.startdate),
                  lte: new Date(req.query.enddate),
                },
              },
            }),
          ]);
        }
      }
      // modify data to actual data of sale invoice's current value by adjusting with transactions and returns
      const transactions = await prisma.transaction.findMany({
        where: {
          type: "sale",
          related_id: {
            in: saleInvoices.map((item) => item.id),
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
      // the return that paid back to customer on return invoice
      const transactions2 = await prisma.transaction.findMany({
        where: {
          type: "sale_return",
          related_id: {
            in: saleInvoices.map((item) => item.id),
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
      // calculate the discount given amount at the time of make the payment
      const transactions3 = await prisma.transaction.findMany({
        where: {
          type: "sale",
          related_id: {
            in: saleInvoices.map((item) => item.id),
          },
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
      const returnSaleInvoice = await prisma.returnSaleInvoice.findMany({
        where: {
          saleInvoice_id: {
            in: saleInvoices.map((item) => item.id),
          },
        },
      });
      // calculate paid amount and due amount of individual sale invoice from transactions and returnSaleInvoice and attach it to saleInvoices
      const allSaleInvoice = saleInvoices.map((item) => {
        const paidAmount = transactions
          .filter((transaction) => transaction.related_id === item.id)
          .reduce((acc, curr) => acc + curr.amount, 0);
        const paidAmountReturn = transactions2
          .filter((transaction) => transaction.related_id === item.id)
          .reduce((acc, curr) => acc + curr.amount, 0);
        const discountGiven = transactions3
          .filter((transaction) => transaction.related_id === item.id)
          .reduce((acc, curr) => acc + curr.amount, 0);
        const returnAmount = returnSaleInvoice
          .filter(
            (returnSaleInvoice) => returnSaleInvoice.saleInvoice_id === item.id
          )
          .reduce((acc, curr) => acc + curr.total_amount, 0);
        const totalUnitMeasurement = item.saleInvoiceProduct.reduce(
          (acc, curr) =>
            acc +
            Number(curr.product.unit_measurement) *
              Number(curr.product_quantity),
          0
        );
        return {
          ...item,
          paid_amount: paidAmount,
          discount: item.discount + discountGiven,
          // item.total_amount already includes discount and round_off_amount
          // So we only need to subtract payments, returns, and additional discounts given at payment time
          // 
          due_amount: item.due_amount,
          total_unit_measurement: totalUnitMeasurement,
        };
      });
      // calculate total paid_amount and due_amount from allSaleInvoice and attach it to aggregations
      const totalPaidAmount = allSaleInvoice.reduce(
        (acc, curr) => acc + curr.paid_amount,
        0
      );
      const totalDueAmount = allSaleInvoice.reduce(
        (acc, curr) => acc + curr.due_amount,
        0
      );
      const totalUnitMeasurement = allSaleInvoice.reduce(
        (acc, curr) => acc + curr.total_unit_measurement,
        0
      );
      const totalUnitQuantity = allSaleInvoice
        .map((item) =>
          item.saleInvoiceProduct.map((item) => item.product_quantity)
        )
        .flat()
        .reduce((acc, curr) => acc + curr, 0);
      const totalDiscountGiven = allSaleInvoice.reduce(
        (acc, curr) => acc + curr.discount,
        0
      );

      aggregations._sum.paid_amount = totalPaidAmount;
      aggregations._sum.discount = totalDiscountGiven;
      aggregations._sum.due_amount = totalDueAmount;
      aggregations._sum.total_unit_measurement = totalUnitMeasurement;
      aggregations._sum.total_unit_quantity = totalUnitQuantity;
      res.json({
        aggregations,
        allSaleInvoice,
      });
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  }
};

const getSingleSaleInvoice = async (req, res) => {
  try {
    const singleSaleInvoice = await prisma.saleInvoice.findUnique({
      where: {
        id: Number(req.params.id),
        // invoice_number: Number(req.params.invoice_number)
      },
      include: {
        saleInvoiceProduct: {
          include: {
            product: {
              include: {
                book_publisher: true,
              },
            },
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
    // view the transactions of the sale invoice
    const transactions = await prisma.transaction.findMany({
      where: {
        related_id: Number(req.params.id),
        OR: [
          {
            type: "sale",
          },
          {
            type: "sale_return",
          },
        ],
        // credit_id: {
        //   not: null, // Only include transactions with valid credit_id
        // },
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
        type: "sale",
        related_id: Number(req.params.id),
        OR: [
          {
            debit_id: 1,
          },
          {
            debit_id: 2,
          },
        ],
        // credit_id: {
        //   not: null, // Only include transactions with valid credit_id
        // },
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
    // for total return amount
    const returnSaleInvoice = await prisma.returnSaleInvoice.findMany({
      where: {
        saleInvoice_id: Number(req.params.id),
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
        related_id: Number(req.params.id),
        debit_id: 14,
        // credit_id: {
        //   not: null, // Only include transactions with valid credit_id
        // },
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
        related_id: Number(req.params.id),
        OR: [
          {
            credit_id: 1,
          },
          {
            credit_id: 2,
          },
        ],
        // credit_id: {
        //   not: null, // Only include transactions with valid credit_id
        // },
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
    let status = "UNPAID";
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
    console.log(paidAmountReturn);
    // const dueAmount =
    //   singleSaleInvoice.total_amount -
    //   singleSaleInvoice.discount -
    //   totalPaidAmount -
    //   totalDiscountAmount -
    //   totalReturnAmount +
    //   paidAmountReturn;
    const dueAmount = singleSaleInvoice.due_amount;
    if (dueAmount === 0) {
      status = "PAID";
    }
    // calculate total unit_measurement
    const totalUnitMeasurement = singleSaleInvoice.saleInvoiceProduct.reduce(
      (acc, item) =>
        acc + Number(item.product.unit_measurement) * item.product_quantity,
      0
    );
    // console.log(totalUnitMeasurement);
    res.json({
      status,
      totalPaidAmount,
      totalReturnAmount,
      dueAmount,
      totalUnitMeasurement,
      singleSaleInvoice,
      returnSaleInvoice,
      transactions,
    });
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const updateSingleSaleInvoice = async (req, res) => {
  try {
    // Check if the sale invoice exists
    const existingInvoice = await prisma.saleInvoice.findUnique({
      where: {
        id: Number(req.params.id), // Use the invoice ID from params to find the invoice
      },
    });

    if (!existingInvoice) {
      return res.status(404).json({ message: 'Sale invoice not found.' });
    }

    // Check if the invoice number is being updated to one that already exists
    if (
      existingInvoice.invoice_number !== Number(req.body.invoiceNumber) &&
      (await prisma.saleInvoice.findFirst({
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

    // Calculate the new total sale price, total discount, and other values
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

    // Get all product information asynchronously
    const allProduct = await Promise.all(
      req.body.saleInvoiceProduct.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: {
            id: item.product_id,
          },
        });
        return product;
      })
    );

    // Calculate the new total purchase price
    let totalPurchasePrice = 0;
    req.body.saleInvoiceProduct.forEach((item, index) => {
      totalPurchasePrice +=
        allProduct[index].purchase_price * item.product_quantity;
    });

    // Convert incoming date to a specific format
    const date = new Date(req.body.date).toISOString().split('T')[0];

    // Update the sale invoice
    const updatedInvoice = await prisma.saleInvoice.update({
      where: {
        id: Number(req.params.id), // Use the invoice ID from params to find the invoice
      },
      data: {
        date: new Date(date),
        total_amount: totalSalePrice,
        discount: parseFloat(req.body.discount),
        paid_amount: parseFloat(req.body.paid_amount),
        total_product_discount: totalProductDiscount,
        total_product_qty: totalProductQty,
        profit:
          totalSalePrice -
          totalProductDiscount -
          parseFloat(req.body.discount) -
          totalPurchasePrice,
        due_amount:
          totalSalePrice -
          totalProductDiscount -
          parseFloat(req.body.discount) -
          parseFloat(req.body.paid_amount),
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
        // Update the related products in the sale invoice
        saleInvoiceProduct: {
          deleteMany: {}, // Delete existing products before creating new ones
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

    // Create/update the necessary journal entries for the updated invoice
    if (req.body.paid_amount > 0) {
      await prisma.transaction.create({
        data: {
          date: new Date(date),
          debit_id: 1,
          credit_id: 8,
          amount: parseFloat(req.body.paid_amount),
          particulars: `Cash receive on Sale Invoice #${updatedInvoice.id}`,
          type: 'sale',
          related_id: updatedInvoice.id,
        },
      });
    }

    const due_amount =
      totalSalePrice -
      parseFloat(req.body.discount) -
      parseFloat(req.body.paid_amount);
    if (due_amount > 0) {
      await prisma.transaction.create({
        data: {
          date: new Date(date),
          debit_id: 4,
          credit_id: 8,
          amount: due_amount,
          particulars: `Due on Sale Invoice #${updatedInvoice.id}`,
          type: 'sale',
          related_id: updatedInvoice.id,
        },
      });
    }

    await prisma.transaction.create({
      data: {
        date: new Date(date),
        debit_id: 9,
        credit_id: 3,
        amount: totalPurchasePrice,
        particulars: `Cost of sales on Sale Invoice #${updatedInvoice.id}`,
        type: 'sale',
        related_id: updatedInvoice.id,
      },
    });

    // Iterate through the updated product quantities and decrement stock
    req.body.saleInvoiceProduct.forEach(async (item) => {
      await prisma.product.update({
        where: {
          id: Number(item.product_id),
        },
        data: {
          quantity: {
            decrement: Number(item.product_quantity),
          },
        },
      });
    });

    // Return the updated invoice data
    res.json({
      updatedInvoice,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
    console.log(error.message);
  }
};


module.exports = {
  createSingleSaleInvoice,
  getAllSaleInvoice,
  getSingleSaleInvoice,
  updateSingleSaleInvoice
};
