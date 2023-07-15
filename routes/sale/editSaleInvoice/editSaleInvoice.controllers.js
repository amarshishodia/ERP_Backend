const editSingleSaleInvoice = async (req, res) => {
  try {
    const invoiceId = Number(req.params.id);

    // Retrieve the existing invoice
    const existingInvoice = await prisma.saleInvoice.findUnique({
      where: {
        id: invoiceId,
      },
      include: {
        saleInvoiceProduct: {
          include: {
            product: true,
          },
        },
      },
    });

    // Check if the invoice exists
    if (!existingInvoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    // calculate total sale price
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

      totalProductQty += parseInt(item.product_quantity); // to sum total product quantity
    });

    // get all product asynchronously
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

    // iterate over all product and calculate total purchase price
    let totalPurchasePrice = 0;
    req.body.saleInvoiceProduct.forEach((item, index) => {
      totalPurchasePrice +=
        allProduct[index].purchase_price * item.product_quantity;
    });

    // convert all incoming date to a specific format.
    const date = new Date(req.body.date).toISOString().split("T")[0];

    // Update the invoice fields with the edited values
    const updatedInvoice = await prisma.saleInvoice.update({
      where: {
        id: invoiceId,
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
        // Update other invoice fields as needed based on req.body

        saleInvoiceProduct: {
          // Update or create the saleInvoiceProduct based on req.body
          upsert: req.body.saleInvoiceProduct.map((product) => ({
            where: {
              id: product.id, // Use the ID to identify existing products
            },
            create: {
              // Create new products if no ID is provided
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
            },
            update: {
              // Update existing products if an ID is provided
              product_quantity: Number(product.product_quantity),
              product_sale_price: parseFloat(product.product_sale_price),
              product_sale_discount: parseFloat(product.product_sale_discount),
              product_sale_currency: product.product_sale_currency,
              product_sale_conversion: parseFloat(
                product.product_sale_conversion
              ),
            },
          })),
        },
      },
    });

    // Update other related operations (transactions, product quantities) as needed

    // Return the updated invoice
    res.json(updatedInvoice);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

module.exports = {
  editSingleSaleInvoice,
};
