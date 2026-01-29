const express = require("express");
const {
  createSingleDiscountMaster,
  getAllDiscountMaster,
  getSingleDiscountMaster,
  updateSingleDiscountMaster,
  deleteSingleDiscountMaster,
} = require("./discountMaster.controllers");
const authorize = require("../../../utils/authorize"); // authentication middleware

const discountMasterRoutes = express.Router();

discountMasterRoutes.post(
  "/",
  authorize("createDiscountMaster"),
  createSingleDiscountMaster
);
discountMasterRoutes.get(
  "/",
  authorize("viewDiscountMaster"),
  getAllDiscountMaster
);
discountMasterRoutes.get(
  "/:id",
  authorize("viewDiscountMaster"),
  getSingleDiscountMaster
);
discountMasterRoutes.put(
  "/:id",
  authorize("updateDiscountMaster"),
  updateSingleDiscountMaster
);
discountMasterRoutes.delete(
  "/:id",
  authorize("deleteDiscountMaster"),
  deleteSingleDiscountMaster
);

module.exports = discountMasterRoutes;
