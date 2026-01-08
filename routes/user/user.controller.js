const { getCompanyId } = require("../../utils/company");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const bcrypt = require("bcrypt");
const saltRounds = 10;

const jwt = require("jsonwebtoken");
const secret = process.env.JWT_SECRET;

const login = async (req, res) => {
  try {
    const allUser = await prisma.user.findMany();
    const user = allUser.find(
      (u) =>
        u.username === req.body.username &&
        bcrypt.compareSync(req.body.password, u.password)
    );
    
    if (!user) {
      return res
        .status(400)
        .json({ message: "Username or password is incorrect" });
    }

    // get permission from user roles using name and company_id
    // Use findUnique with composite key if company_id exists, otherwise use findFirst
    let permissions;
    if (user.company_id) {
      permissions = await prisma.role.findUnique({
        where: {
          name_company_id: {
            name: user.role,
            company_id: user.company_id,
          },
        },
        include: {
          rolePermission: {
            include: {
              permission: true,
            },
          },
        },
      });
    } else {
      // Fallback for users without company_id (shouldn't happen in production)
      permissions = await prisma.role.findFirst({
        where: {
          name: user.role,
        },
        include: {
          rolePermission: {
            include: {
              permission: true,
            },
          },
        },
      });
    }

    if (!permissions) {
      return res
        .status(400)
        .json({ message: "Role not found for this company" });
    }

    // store all permissions name to an array
    const permissionNames = permissions.rolePermission.map(
      (rp) => rp.permission.name
    );
    // console.log("permissionNames", permissionNames);
    
    const token = jwt.sign(
      { sub: user.id, permissions: permissionNames },
      secret,
      {
        expiresIn: "24h",
      }
    );
    const { password, ...userWithoutPassword } = user;
    return res.json({
      ...userWithoutPassword,
      token,
    });
  } catch (error) {
    res.status(500).json(error.message);
  }
};

const register = async (req, res) => {
  try {
    // Get company_id from logged-in user (if available)
    const companyId = await getCompanyId(req.auth?.sub);
    
    const join_date = new Date(req.body.join_date).toISOString().split("T")[0];
    const leave_date = new Date(req.body.leave_date)
      .toISOString()
      .split("T")[0];

    const hash = await bcrypt.hash(req.body.password, saltRounds);
    
    const userData = {
      username: req.body.username,
      password: hash,
      role: req.body.role,
      email: req.body.email,
      salary: parseInt(req.body.salary),
      join_date: new Date(join_date),
      leave_date: new Date(leave_date),
      id_no: req.body.id_no,
      department: req.body.department,
      phone: req.body.phone,
      address: req.body.address,
      blood_group: req.body.blood_group,
      image: req.body.image,
      status: req.body.status,
      designation: {
        connect: {
          id: Number(req.body.designation_id),
        },
      },
    };

    // Set company_id if available (from logged-in user creating this user)
    if (companyId) {
      userData.company = {
        connect: { id: companyId },
      };
    }

    const createUser = await prisma.user.create({
      data: userData,
    });
    const { password, ...userWithoutPassword } = createUser;
    res.json(userWithoutPassword);
  } catch (error) {
    res.status(500).json(error.message);
  }
};

const getAllUser = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth?.sub);
  
  // Build where clause - filter by company_id if available
  const whereClause = {};
  if (companyId) {
    whereClause.company_id = companyId;
  }

  if (req.query.query === "all") {
    try {
      const includeClause = {
        saleInvoice: companyId ? {
          where: { company_id: companyId },
        } : true,
      };

      const allUser = await prisma.user.findMany({
        where: whereClause,
        include: includeClause,
      });
      res.json(
        allUser
          .map((u) => {
            const { password, ...userWithoutPassword } = u;
            return userWithoutPassword;
          })
          .sort((a, b) => a.id - b.id)
      );
    } catch (error) {
      res.status(500).json(error.message);
    }
  } else if (req.query.status === "false") {
    try {
      const includeClause = {
        saleInvoice: companyId ? {
          where: { company_id: companyId },
        } : true,
      };

      const allUser = await prisma.user.findMany({
        where: {
          status: false,
          ...whereClause,
        },
        include: includeClause,
      });
      res.json(
        allUser
          .map((u) => {
            const { password, ...userWithoutPassword } = u;
            return userWithoutPassword;
          })
          .sort((a, b) => a.id - b.id)
      );
    } catch (error) {
      res.status(500).json(error.message);
    }
  } else {
    try {
      const includeClause = {
        saleInvoice: companyId ? {
          where: { company_id: companyId },
        } : true,
      };

      const allUser = await prisma.user.findMany({
        where: {
          status: true,
          ...whereClause,
        },
        include: includeClause,
      });
      res.json(
        allUser
          .map((u) => {
            const { password, ...userWithoutPassword } = u;
            return userWithoutPassword;
          })
          .sort((a, b) => a.id - b.id)
      );
    } catch (error) {
      res.status(500).json(error.message);
    }
  }
};

const getSingleUser = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth?.sub);
  
  const id = parseInt(req.params.id);

  // only allow admins and owner to access other user records
  // console.log(id !== req.auth.sub && !req.auth.permissions.includes("viewUser"));
  if (id !== req.auth.sub && !req.auth.permissions.includes("viewUser")) {
    return res
      .status(401)
      .json({ message: "Unauthorized. You are not an admin" });
  }

  // Build where clause
  const whereClause = { id: Number(req.params.id) };
  if (companyId) {
    whereClause.company_id = companyId;
  }

  const includeClause = {
    saleInvoice: companyId ? {
      where: { company_id: companyId },
    } : true,
  };

  const singleUser = await prisma.user.findFirst({
    where: whereClause,
    include: includeClause,
  });

  if (!singleUser) {
    return res.status(404).json({ message: "User not found" });
  }

  const { password, ...userWithoutPassword } = singleUser;
  res.json(userWithoutPassword);
};

const updateSingleUser = async (req, res) => {
  const id = parseInt(req.params.id);
  // only allow admins and owner to edit other user records
  // console.log(
  //   id !== req.auth.sub && !req.auth.permissions.includes("updateUser")
  // );
  if (id !== req.auth.sub && !req.auth.permissions.includes("updateUser")) {
    return res.status(401).json({
      message: "Unauthorized. You can only edit your own record.",
    });
  }

  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth?.sub);

  // Verify that the user belongs to the same company (if company_id is set)
  if (companyId) {
    const existingUser = await prisma.user.findFirst({
      where: {
        id: Number(req.params.id),
        company_id: companyId,
      },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }
  }

  try {
    // admin can change all fields
    if (req.auth.permissions.includes("updateUser")) {
      const hash = await bcrypt.hash(req.body.password, saltRounds);
      const join_date = new Date(req.body.join_date)
        .toISOString()
        .split("T")[0];
      const leave_date = new Date(req.body.leave_date)
        .toISOString()
        .split("T")[0];
      const updateUser = await prisma.user.update({
        where: {
          id: Number(req.params.id),
        },
        data: {
          username: req.body.username,
          password: hash,
          role: req.body.role,
          email: req.body.email,
          salary: parseInt(req.body.salary),
          join_date: new Date(join_date),
          leave_date: new Date(leave_date),
          id_no: req.body.id_no,
          department: req.body.department,
          phone: req.body.phone,
          address: req.body.address,
          blood_group: req.body.blood_group,
          image: req.body.image,
          status: req.body.status,
          designation: {
            connect: {
              id: Number(req.body.designation_id),
            },
          },
        },
      });
      const { password, ...userWithoutPassword } = updateUser;
      res.json(userWithoutPassword);
    } else {
      // owner can change only password
      const hash = await bcrypt.hash(req.body.password, saltRounds);
      const updateUser = await prisma.user.update({
        where: {
          id: Number(req.params.id),
        },
        data: {
          password: hash,
        },
      });
      const { password, ...userWithoutPassword } = updateUser;
      res.json(userWithoutPassword);
    }
  } catch (error) {
    res.status(500).json(error.message);
  }
};

const deleteSingleUser = async (req, res) => {
  // const id = parseInt(req.params.id);
  // only allow admins to delete other user records
  if (!req.auth.permissions.includes("deleteUser")) {
    return res
      .status(401)
      .json({ message: "Unauthorized. Only admin can delete." });
  }

  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth?.sub);

  // Verify that the user belongs to the same company (if company_id is set)
  if (companyId) {
    const existingUser = await prisma.user.findFirst({
      where: {
        id: Number(req.params.id),
        company_id: companyId,
      },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }
  }

  try {
    const deleteUser = await prisma.user.update({
      where: {
        id: Number(req.params.id),
      },
      data: {
        status: req.body.status,
      },
    });
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json(error.message);
  }
};

module.exports = {
  login,
  register,
  getAllUser,
  getSingleUser,
  updateSingleUser,
  deleteSingleUser,
};
