const express = require("express");
const {
  createSingleBookPublisher,
  getAllBookPublishers,
  getSingleBookPublisher,
  updateSingleBookPublisher,
  deleteSingleBookPublisher,
} = require("./bookPublisher.controllers");

const authorize = require("../../../utils/authorize"); // authentication middleware

const bookPublisherRoutes = express.Router();

bookPublisherRoutes.post(
  "/",
  authorize("createBookPublisher"),
  createSingleBookPublisher
);
bookPublisherRoutes.get(
  "/",
  authorize("viewBookPublisher"),
  getAllBookPublishers
);
bookPublisherRoutes.get(
  "/:id",
  authorize("viewBookPublisher"),
  getSingleBookPublisher
);
bookPublisherRoutes.put(
  "/:id",
  authorize("updateBookPublisher"),
  updateSingleBookPublisher
);
bookPublisherRoutes.delete(
  "/:id",
  authorize("deleteBookPublisher"),
  deleteSingleBookPublisher
);

module.exports = bookPublisherRoutes;
