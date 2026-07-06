const express = require("express");
const {
  createSinglePurchaseInvoice,
  getAllPurchaseInvoice,
  getSinglePurchaseInvoice,
  updateSinglePurchaseInvoice,
  deleteSinglePurchaseInvoice,
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
purchaseInvoiceRoutes.post(  "/delete/:id",  authorize("deletePurchaseInvoice"),  deleteSinglePurchaseInvoice);
purchaseInvoiceRoutes.get(  "/",  authorize("viewPurchaseInvoice"),  getAllPurchaseInvoice);
purchaseInvoiceRoutes.post(  "/analyze-bill",  authorize("createPurchaseInvoice"),  upload.array('files', 10),  analyzeBill);
purchaseInvoiceRoutes.post(  "/import-excel",  authorize("createPurchaseInvoice"),  excelUpload.single("file"),  parsePurchaseExcel);
purchaseInvoiceRoutes.post(  "/analyze-new-items",  authorize("createPurchaseInvoice"),  analyzeNewItems);
purchaseInvoiceRoutes.get(  "/:id",  authorize("viewPurchaseInvoice"),  getSinglePurchaseInvoice);
purchaseInvoiceRoutes.put(  "/:id",  authorize("createPurchaseInvoice"),  updateSinglePurchaseInvoice);
purchaseInvoiceRoutes.delete(  "/:id",  authorize("deletePurchaseInvoice"),  deleteSinglePurchaseInvoice);
purchaseInvoiceRoutes.patch(  "/:id",  authorize("deletePurchaseInvoice"),  deleteSinglePurchaseInvoice);

module.exports = purchaseInvoiceRoutes;
