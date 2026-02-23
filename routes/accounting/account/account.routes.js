const express = require("express");
const {
  createSingleAccount,
  getAllAccount,
  getSingleAccount,
  updateSingleAccount,
  deleteSingleAccount,
  getPartyStatement,
} = require("./account.controllers");
const authorize = require("../../../utils/authorize"); // authentication middleware

const accountRoutes = express.Router();

accountRoutes.post("/", authorize("createTransaction"), createSingleAccount);
accountRoutes.get("/party-statement", authorize("viewTransaction"), getPartyStatement);
accountRoutes.get("/", authorize("viewTransaction"), getAllAccount);
accountRoutes.get("/:id", authorize("viewTransaction"), getSingleAccount);
accountRoutes.put("/:id", authorize("updateTransaction"), updateSingleAccount);
accountRoutes.patch(
  "/:id",
  authorize("deleteTransaction"),
  deleteSingleAccount
);

module.exports = accountRoutes;
