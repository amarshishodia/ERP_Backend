const express = require("express");
const {
  createSinglePurchaseInvoice,
  getAllPurchaseInvoice,
  getSinglePurchaseInvoice,
  updateSinglePurchaseInvoice,
} = require("./purchaseInvoice.controllers");
const {
  upload,
  excelUpload,
  analyzeBill,
  parsePurchaseExcel,
  analyzeNewItems,
} = require("./billAnalysis.controllers");
const authorize = require("../../../utils/authorize"); // authentication middleware

const purchaseInvoiceRoutes = express.Router();

purchaseInvoiceRoutes.post(  "/",  authorize("createPurchaseInvoice"),  createSinglePurchaseInvoice);
purchaseInvoiceRoutes.get(  "/",  authorize("viewPurchaseInvoice"),  getAllPurchaseInvoice);
purchaseInvoiceRoutes.get(  "/:id",  authorize("viewPurchaseInvoice"),  getSinglePurchaseInvoice);
purchaseInvoiceRoutes.put(  "/:id",  authorize("createPurchaseInvoice"),  updateSinglePurchaseInvoice);
purchaseInvoiceRoutes.post(  "/analyze-bill",  authorize("createPurchaseInvoice"),  upload.array('files', 10),  analyzeBill);
purchaseInvoiceRoutes.post(  "/import-excel",  authorize("createPurchaseInvoice"),  excelUpload.single("file"),  parsePurchaseExcel);
purchaseInvoiceRoutes.post(  "/analyze-new-items",  authorize("createPurchaseInvoice"),  analyzeNewItems);

module.exports = purchaseInvoiceRoutes;
