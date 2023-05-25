const express = require("express");
const {
  createSingleProductCurrency,
  getAllProductCurrency,
  getSingleProductCurrency,
  updateSingleProductCurrency,
  deleteSingleProductCurrency,
} = require("./productCurrency.controllers");
const authorize = require("../../../utils/authorize"); // authentication middleware

const productCurrencyRoutes = express.Router();

productCurrencyRoutes.post(
  "/",
  authorize("createProductCurrency"),
  createSingleProductCurrency
);
productCurrencyRoutes.get(
  "/",
  authorize("viewProductCurrency"),
  getAllProductCurrency
);
productCurrencyRoutes.get(
  "/:id",
  authorize("viewProductCurrency"),
  getSingleProductCurrency
);
productCurrencyRoutes.put(
  "/:id",
  authorize("updateProductCurrency"),
  updateSingleProductCurrency
);
productCurrencyRoutes.delete(
  "/:id",
  authorize("deleteProductCurrency"),
  deleteSingleProductCurrency
);

module.exports = productCurrencyRoutes;
