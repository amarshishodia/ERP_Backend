const express = require("express");
const {
  createSingleQuotation,
  getAllQuotation,
  getSingleQuotation,
  convertQuotationToSale,
  updateSingleQuotation
} = require("./quotationInvoice.controllers");
const authorize = require("../../../utils/authorize");

const quotationRoutes = express.Router();

quotationRoutes.post("/", authorize("createSaleInvoice"), createSingleQuotation);
quotationRoutes.get("/", authorize("viewSaleInvoice"), getAllQuotation);
quotationRoutes.get("/:id", authorize("viewSaleInvoice"), getSingleQuotation);
quotationRoutes.put("/:id", authorize("createSaleInvoice"), updateSingleQuotation);
quotationRoutes.post("/:id/convert", authorize("createSaleInvoice"), convertQuotationToSale);

module.exports = quotationRoutes;

