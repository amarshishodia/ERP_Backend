const { getCompanyId } = require("../../../utils/company");
const prisma = require("../../../utils/prisma");

const editSingleSaleInvoice = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const invoiceId = Number(req.params.id);

    // Retrieve the existing invoice
    const existingInvoice = await prisma.saleInvoice.findFirst({
      where: {
        id: invoiceId,
        company_id: companyId,
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

    // Calculate final totals with round off
    const subtotalAfterProductDiscounts = totalSalePrice - totalProductDiscount;
    const additionalDiscount = parseFloat(req.body.discount) || 0;
    const roundOffAmount = parseFloat(req.body.round_off_amount) || 0;
    const roundOffEnabled = req.body.round_off_enabled || false;
    const finalTotal = subtotalAfterProductDiscounts - additionalDiscount + roundOffAmount;
    const paidAmount = parseFloat(req.body.paid_amount) || 0;
    const dueAmount = finalTotal - paidAmount;

    // Verify that all products exist (products are now master)
    const productIds = req.body.saleInvoiceProduct.map(p => Number(p.product_id));
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, purchase_price: true },
    });

    if (products.length !== productIds.length) {
      return res.status(404).json({ error: "Some products not found" });
    }

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
