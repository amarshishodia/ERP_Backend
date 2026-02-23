const express = require("express");
const path = require("path");
const fs = require("fs");
const { updateSetting, getSetting } = require("./setting.controllers");
const authorize = require("../../utils/authorize"); // authentication middleware

const crypto = require("crypto"); // for generating random names
const multer = require("multer");

const settingRoutes = express.Router();

const logoDir = path.join(__dirname, "logo");
if (!fs.existsSync(logoDir)) {
  fs.mkdirSync(logoDir, { recursive: true });
}

const generateFileName = (bytes = 32) =>
  crypto.randomBytes(bytes).toString("hex");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, logoDir);
  },
  filename: function (req, file, cb) {
    const ext = (file.originalname && path.extname(file.originalname)) || ".jpg";
    cb(null, generateFileName() + ext);
  },
});
const upload = multer({ storage });

settingRoutes.put("/", authorize("updateSetting"), upload.single("image"), updateSetting);
settingRoutes.get("/", authorize("viewSetting"), getSetting);

// serve logo image
settingRoutes.get("/logo/:filename", (req, res) => {
  const filePath = path.join(logoDir, req.params.filename);
  if (!path.resolve(filePath).startsWith(path.resolve(logoDir))) {
    return res.status(400).send("Invalid path");
  }
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).send("Not found");
  });
});

module.exports = settingRoutes;
