const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const { PrismaClient } = require("@prisma/client");
const { query } = require("express");
const prisma = new PrismaClient();

const createSingleRole = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    if (req.query.query === "deletemany") {
      // delete many roles at once (only for user's company)
      const deletedRole = await prisma.role.deleteMany({
        where: {
          id: {
            in: req.body,
          },
          company_id: companyId,
        },
      });
      res.json(deletedRole);
    } else if (req.query.query === "createmany") {
      // create many roles from an array of objects with company_id
      const dataWithCompanyId = req.body.map((role) => ({
        ...role,
        company_id: companyId,
      }));
      const createdRole = await prisma.role.createMany({
        data: dataWithCompanyId,
        skipDuplicates: true,
      });
      res.status(200).json(createdRole);
    } else {
      // create single role with company_id
      const createdRole = await prisma.role.create({
        data: {
          name: req.body.name,
          company_id: companyId,
        },
      });
      res.status(200).json(createdRole);
    }
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const getAllRole = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }

  if (req.query.query === "all") {
    const allRole = await prisma.role.findMany({
      where: {
        company_id: companyId,
      },
      orderBy: [
        {
          id: "asc",
        },
      ],
      include: {
        rolePermission: {
          include: {
            permission: true,
          },
        },
      },
    });
    res.json(allRole);
  } else if (req.query.status === "false") {
    try {
      const { skip, limit } = getPagination(req.query);
      const allRole = await prisma.role.findMany({
        where: {
          status: false,
          company_id: companyId,
        },
        orderBy: [
          {
            id: "asc",
          },
        ],
        skip: Number(skip),
        take: Number(limit),
        include: {
          rolePermission: {
            include: {
              permission: true,
            },
          },
        },
      });
      res.json(allRole);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else {
    const { skip, limit } = getPagination(req.query);
    try {
      const allRole = await prisma.role.findMany({
        where: {
          status: true,
          company_id: companyId,
        },
        orderBy: [
          {
            id: "asc",
          },
        ],
        skip: Number(skip),
        take: Number(limit),
        include: {
          rolePermission: {
            include: {
              permission: true,
            },
          },
        },
      });
      res.json(allRole);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  }
};

const getSingleRole = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const singleRole = await prisma.role.findUnique({
      where: {
        id: Number(req.params.id),
      },
      include: {
        rolePermission: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!singleRole) {
      return res.status(404).json({ error: "Role not found" });
    }

    // Verify that the role belongs to the user's company
    if (singleRole.company_id !== companyId) {
      return res.status(403).json({ error: "Role does not belong to your company" });
    }

    res.json(singleRole);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const updateSingleRole = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // Verify that the role belongs to the user's company
    const existingRole = await prisma.role.findUnique({
      where: { id: Number(req.params.id) },
      select: { company_id: true },
    });

    if (!existingRole) {
      return res.status(404).json({ error: "Role not found" });
    }

    if (existingRole.company_id !== companyId) {
      return res.status(403).json({ error: "Role does not belong to your company" });
    }

    const updatedRole = await prisma.role.update({
      where: {
        id: Number(req.params.id),
      },
      data: {
        name: req.body.name,
      },
    });
    res.json(updatedRole);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const deleteSingleRole = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // Verify that the role belongs to the user's company
    const existingRole = await prisma.role.findUnique({
      where: { id: Number(req.params.id) },
      select: { company_id: true },
    });

    if (!existingRole) {
      return res.status(404).json({ error: "Role not found" });
    }

    if (existingRole.company_id !== companyId) {
      return res.status(403).json({ error: "Role does not belong to your company" });
    }

    const deletedRole = await prisma.role.update({
      where: {
        id: Number(req.params.id),
      },
      data: {
        status: req.body.status,
      },
    });
    res.status(200).json(deletedRole);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

module.exports = {
  createSingleRole,
  getAllRole,
  getSingleRole,
  updateSingleRole,
  deleteSingleRole,
};
