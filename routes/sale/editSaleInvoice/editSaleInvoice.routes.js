const express = require("express");
const {
  createSingleEditSaleInvoice,
  getAllEditSaleInvoice,
  getSingleEditSaleInvoice,
  updateSingleEditSaleInvoice,
  deleteSingleEditSaleInvoice,
} = require("./editSaleInvoice.controllers");
const authorize = require("../../../utils/authorize"); // authentication middleware

const editSaleInvoiceRoutes = express.Router();

editSaleInvoiceRoutes.post(
  "/",
  authorize("createEditSaleInvoice"),
  createSingleEditSaleInvoice
);
editSaleInvoiceRoutes.get(
  "/",
  authorize("viewEditSaleInvoice"),
  getAllEditSaleInvoice
);
editSaleInvoiceRoutes.get(
  "/:id",
  authorize("viewEditSaleInvoice"),
  getSingleEditSaleInvoice
);
// EditSaleInvoiceRoutes.put("/:id", authorize("updatePurchaseInvoice"), updateSinglePurchaseInvoice); // purchase invoice is not updatable
editSaleInvoiceRoutes.patch(
  "/:id",
  authorize("deleteEditSaleInvoice"),
  deleteSingleEditSaleInvoice
);

module.exports = editSaleInvoiceRoutes;
