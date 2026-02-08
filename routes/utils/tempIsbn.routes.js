const express = require("express");
const router = express.Router();
const authorize = require("../../utils/authorize");
const { getNextTempIsbn } = require("./tempIsbn.controllers");

// Require authentication (use an appropriate permission, here reuse createPurchaseInvoice)
router.get("/next-temp-isbn", authorize("createPurchaseInvoice"), getNextTempIsbn);

module.exports = router;

