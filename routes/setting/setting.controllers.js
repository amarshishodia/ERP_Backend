const { getCompanyId } = require("../../utils/company");
const prisma = require("../../utils/prisma");

const updateSetting = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }
    const companyIdNum = parseInt(companyId, 10);
    if (isNaN(companyIdNum) || companyIdNum <= 0) {
      return res.status(400).json({ error: "Invalid company_id" });
    }

    const data = { ...req.body };
    if (req.file && req.file.filename) {
      data.logo = req.file.filename;
    }
    const updatedSetting = await prisma.appSetting.update({
      where: { id: companyIdNum },
      data,
    });
    res.status(201).json(updatedSetting);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const getSetting = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }
    const companyIdNum = parseInt(companyId, 10);
    if (isNaN(companyIdNum) || companyIdNum <= 0) {
      return res.status(400).json({ error: "Invalid company_id" });
    }

    const newSetting = await prisma.appSetting.findUnique({
      where: { id: companyIdNum },
    });
    res.status(201).json(newSetting);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

module.exports = {
  updateSetting,
  getSetting,
};
