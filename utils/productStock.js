const prisma = require("./prisma");

/**
 * Adjust stock quantity for a product/company pair.
 * product_stock is one row per (product_id, company_id); purchase/sale history lives in separate tables.
 */
async function adjustProductStock({
  productId,
  companyId,
  quantityDelta,
  transactionDate,
  listPrice,
  db = prisma,
}) {
  const existing = await db.product_stock.findFirst({
    where: { product_id: productId, company_id: companyId },
  });

  const date = transactionDate ? new Date(transactionDate) : new Date();
  const updateData = {
    quantity: { increment: quantityDelta },
    transactionDate: date,
  };
  if (listPrice !== undefined && Number.isFinite(listPrice)) {
    updateData.list_price = listPrice;
  }

  if (existing) {
    return db.product_stock.update({
      where: { id: existing.id },
      data: updateData,
    });
  }

  return db.product_stock.create({
    data: {
      product_id: productId,
      company_id: companyId,
      quantity: quantityDelta,
      transactionDate: date,
      list_price: Number.isFinite(listPrice) ? listPrice : null,
    },
  });
}

module.exports = { adjustProductStock };
