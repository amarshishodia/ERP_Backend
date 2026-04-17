const express = require("express");
const authorize = require("../../utils/authorize");
const {
  listDocumentSeries,
  createDocumentSeries,
  setDefaultDocumentSeries,
  deleteDocumentSeries,
} = require("./documentSeries.controllers");

const router = express.Router();

router.get("/", authorize("viewSetting"), listDocumentSeries);
router.post("/", authorize("updateSetting"), createDocumentSeries);
router.patch("/:id/default", authorize("updateSetting"), setDefaultDocumentSeries);
router.delete("/:id", authorize("updateSetting"), deleteDocumentSeries);

module.exports = router;

