const { getCompanyId } = require("../../../utils/company");
const prisma = require("../../../utils/prisma");

const getAllLocations = async (req, res) => {
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }
  try {
    const locations = await prisma.location.findMany({
      where: { company_id: companyId },
      orderBy: { name: "asc" },
    });
    res.json(locations);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const createLocation = async (req, res) => {
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }
  try {
    const location = await prisma.location.create({
      data: {
        name: req.body.name,
        company_id: companyId,
      },
    });
    res.json(location);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

module.exports = {
  getAllLocations,
  createLocation,
};
