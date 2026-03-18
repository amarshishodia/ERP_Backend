const express = require("express");
const authorize = require("../../utils/authorize");
const { handleQuery } = require("./chatbot.controllers");

const router = express.Router();

// POST /v1/chatbot/query - requires authentication
router.post("/query", authorize(), handleQuery);

module.exports = router;
