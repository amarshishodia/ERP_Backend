const express = require("express");
const {
  createSingleChallan,
  getAllChallan,
  getSingleChallan,
  convertChallanToSale,
  updateSingleChallan
} = require("./challanInvoice.controllers");
const authorize = require("../../../utils/authorize");

const challanRoutes = express.Router();

challanRoutes.post("/", authorize("createSaleInvoice"), createSingleChallan);
challanRoutes.get("/", authorize("viewSaleInvoice"), getAllChallan);
challanRoutes.get("/:id", authorize("viewSaleInvoice"), getSingleChallan);
challanRoutes.put("/:id", authorize("createSaleInvoice"), updateSingleChallan);
challanRoutes.post("/:id/convert", authorize("createSaleInvoice"), convertChallanToSale);

module.exports = challanRoutes;

