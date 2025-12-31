const express = require("express");
const {
  createSingleSaleInvoice,
  getAllSaleInvoice,
  getSingleSaleInvoice,
  updateSingleSaleInvoice
} = require("./saleInvoice.controllers");
const {
  upload,
  analyzeBill,
  analyzeNewItems,
} = require("./billAnalysis.controllers");
const authorize = require("../../../utils/authorize"); // authentication middleware

const saleInvoiceRoutes = express.Router();

saleInvoiceRoutes.post("/", authorize("createSaleInvoice"), createSingleSaleInvoice);
saleInvoiceRoutes.get("/", authorize("viewSaleInvoice"), getAllSaleInvoice);
saleInvoiceRoutes.get("/:id", authorize("viewSaleInvoice"), getSingleSaleInvoice);
saleInvoiceRoutes.put("/:id", authorize("createSaleInvoice"), updateSingleSaleInvoice);
saleInvoiceRoutes.post("/analyze-bill", authorize("createSaleInvoice"), upload.array('files', 10), analyzeBill);
saleInvoiceRoutes.post("/analyze-new-items", authorize("createSaleInvoice"), analyzeNewItems);


module.exports = saleInvoiceRoutes;
