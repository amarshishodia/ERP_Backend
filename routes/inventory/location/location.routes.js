const express = require("express");
const { getAllLocations, createLocation } = require("./location.controllers");
const authorize = require("../../../utils/authorize");

const locationRoutes = express.Router();

locationRoutes.get("/", authorize("viewProduct"), getAllLocations);
locationRoutes.post("/", authorize("createProduct"), createLocation);

module.exports = locationRoutes;
