const express = require("express");
const { updateSetting, getSetting } = require("./setting.controllers");
const authorize = require("../../utils/authorize"); // authentication middleware

const crypto = require("crypto"); // for generating random names
const multer = require("multer");

const settingRoutes = express.Router();

const logoRoutes = express.Router();

// generate random file name for extra security on naming
const generateFileName = (bytes = 32) =>
  crypto.randomBytes(bytes).toString("hex");

// store files upload folder in disk
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "routes/setting/logo/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = generateFileName();
    cb(null, uniqueSuffix + ".jpg");
  },
});
// multer middleware
const upload = multer({ storage: storage });

// settingRoutes.put("/", authorize("updateSetting"), upload.single("image"), updateSetting);
settingRoutes.put("/", authorize("updateSetting"), updateSetting);

settingRoutes.get("/", authorize("viewSetting"), getSetting);

// to serve image from disk
logoRoutes.get("/:id", (req, res) => {
    res.sendFile(__dirname + "/uploads/" + req.params.id, (err) => {
      if (err) {
        res.status(404).send("Not found");
      }
    });
  });

module.exports = settingRoutes;
