const express = require("express");
const {
  createSingleProductCurrency,
  getAllProductCurrency,
  getSingleProductCurrency,
  updateSingleProductCurrency,
  deleteSingleProductCurrency,
  getCurrencyRates,
  addCurrencyRate,
  deleteCurrencyRate,
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

// Currency Rate Routes
productCurrencyRoutes.get(
  "/:id/rates",
  authorize("viewProductCurrency"),
  getCurrencyRates
);
productCurrencyRoutes.post(
  "/:id/rates",
  authorize("updateProductCurrency"),
  addCurrencyRate
);
productCurrencyRoutes.delete(
  "/:id/rates/:rateId",
  authorize("deleteProductCurrency"),
  deleteCurrencyRate
);

module.exports = productCurrencyRoutes;
