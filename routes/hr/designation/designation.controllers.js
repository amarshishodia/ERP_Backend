const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const prisma = require("../../../utils/prisma");

const createSingleDesignation = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }

  if (req.query.query === "deletemany") {
    try {
      // delete many designation at once (only for user's company)
      const deletedDesignation = await prisma.designation.deleteMany({
        where: {
          id: {
            in: req.body,
          },
          company_id: companyId,
        },
      });
      res.json(deletedDesignation);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else if (req.query.query === "createmany") {
    try {
      // create many designation from an array of objects with company_id
      const dataWithCompanyId = req.body.map((item) => ({
        ...item,
        company_id: companyId,
      }));
      const createdDesignation = await prisma.designation.createMany({
        data: dataWithCompanyId,
        skipDuplicates: true,
      });
      res.json(createdDesignation);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else {
    try {
      // create single designation from an object with company_id
      const createdDesignation = await prisma.designation.create({
        data: {
          name: req.body.name,
          company_id: companyId,
        },
      });
      res.json(createdDesignation);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  }
};

const getAllDesignation = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }

  if (req.query.query === "all") {
    try {
      // get all designation for user's company
      const allDesignation = await prisma.designation.findMany({
        where: {
          company_id: companyId,
        },
        orderBy: {
          id: "asc",
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              role: true,
              salary: true,
              designation: true,
              join_date: true,
              leave_date: true,
              phone: true,
              id_no: true,
              address: true,
              blood_group: true,
              image: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });
      res.json(allDesignation);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else {
    const { skip, limit } = getPagination(req.query);
    try {
      // get all designation paginated for user's company
      const allDesignation = await prisma.designation.findMany({
        where: {
          company_id: companyId,
        },
        orderBy: {
          id: "asc",
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              role: true,
              salary: true,
              designation: true,
              join_date: true,
              leave_date: true,
              phone: true,
              id_no: true,
              address: true,
              blood_group: true,
              image: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
        skip: parseInt(skip),
        take: parseInt(limit),
      });
      res.json(allDesignation);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  }
};

const getSingleDesignation = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const singleDesignation = await prisma.designation.findUnique({
      where: {
        id: parseInt(req.params.id),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            salary: true,
            designation: true,
            join_date: true,
            leave_date: true,
            phone: true,
            id_no: true,
            address: true,
            blood_group: true,
            image: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!singleDesignation) {
      return res.status(404).json({ error: "Designation not found" });
    }

    // Verify that the designation belongs to the user's company
    if (singleDesignation.company_id !== companyId) {
      return res.status(403).json({ error: "Designation does not belong to your company" });
    }

    res.json(singleDesignation);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const updateSingleDesignation = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // Verify that the designation belongs to the user's company
    const existingDesignation = await prisma.designation.findUnique({
      where: { id: parseInt(req.params.id) },
      select: { company_id: true },
    });

    if (!existingDesignation) {
      return res.status(404).json({ error: "Designation not found" });
    }

    if (existingDesignation.company_id !== companyId) {
      return res.status(403).json({ error: "Designation does not belong to your company" });
    }

    const updatedDesignation = await prisma.designation.update({
      where: {
        id: parseInt(req.params.id),
      },
      data: {
        name: req.body.name,
      },
    });
    res.json(updatedDesignation);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const deleteSingleDesignation = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // Verify that the designation belongs to the user's company
    const existingDesignation = await prisma.designation.findUnique({
      where: { id: parseInt(req.params.id) },
      select: { company_id: true },
    });

    if (!existingDesignation) {
      return res.status(404).json({ error: "Designation not found" });
    }

    if (existingDesignation.company_id !== companyId) {
      return res.status(403).json({ error: "Designation does not belong to your company" });
    }

    const deletedDesignation = await prisma.designation.delete({
      where: {
        id: parseInt(req.params.id),
      },
    });
    res.json(deletedDesignation);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

module.exports = {
  createSingleDesignation,
  getAllDesignation,
  getSingleDesignation,
  updateSingleDesignation,
  deleteSingleDesignation,
};
