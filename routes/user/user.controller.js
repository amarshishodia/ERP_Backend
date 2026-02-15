const { getCompanyId } = require("../../utils/company");
const prisma = require("../../utils/prisma");
const cacheService = require("../../utils/cache");
const { sendPasswordResetCode } = require("../../utils/mail");

const bcrypt = require("bcrypt");
const saltRounds = 10;

const jwt = require("jsonwebtoken");
const secret = process.env.JWT_SECRET;

const signup = async (req, res) => {
  try {
    // Validate required fields
    if (!req.body.company_name || !req.body.address || !req.body.company_phone || !req.body.company_email || 
        !req.body.user_email || !req.body.user_phone || !req.body.password) {
      return res.status(400).json({ 
        message: "Company name, address, company phone, company email, user email, user phone, and password are required" 
      });
    }

    // Check if user email is already taken
    const existingUser = await prisma.user.findFirst({
      where: {
        email: req.body.user_email,
      },
    });

    if (existingUser) {
      return res.status(400).json({ message: "User email is already registered" });
    }

    // Check if username (user email) is already taken
    const existingUsername = await prisma.user.findFirst({
      where: {
        username: req.body.user_email,
      },
    });

    if (existingUsername) {
      return res.status(400).json({ message: "User email is already registered as username" });
    }

    // Hash password
    const hash = await bcrypt.hash(req.body.password, saltRounds);

    // Create company and user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Create company (appSetting)
      const company = await tx.appSetting.create({
        data: {
          company_name: req.body.company_name,
          address: req.body.address,
          phone: req.body.company_phone,
          email: req.body.company_email,
        },
      });

      // Step 2: Find existing "admin" role (use first available admin role, not company-specific)
      const adminRole = await tx.role.findFirst({
        where: {
          name: "admin",
        },
      });

      // Step 3: Create user with company_id
      const user = await tx.user.create({
        data: {
          username: req.body.user_email, // Username set from user email
          password: hash,
          role: "admin", // Default role name
          email: req.body.user_email,
          phone: req.body.user_phone || null,
          company_id: company.id,
        },
      });

      return { company, user };
    });

    // Return user data without password
    const { password, ...userWithoutPassword } = result.user;
    
    res.status(201).json({
      message: "Company and user registered successfully",
      user: userWithoutPassword,
      company: {
        id: result.company.id,
        company_name: result.company.company_name,
        email: result.company.email,
      },
    });
  } catch (error) {
    console.log("Signup error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

const login = async (req, res) => {
  try {
    if (!req.body.username || !req.body.password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    // Find user by username first
    const user = await prisma.user.findFirst({
      where: {
        username: req.body.username,
      },
    });

    console.log("user found:", user ? { id: user.id, username: user.username, company_id: user.company_id } : "not found");
    
    if (!user) {
      return res
        .status(400)
        .json({ message: "Username or password is incorrect" });
    }

    // Compare password
    let passwordMatch = false;
    try {
      passwordMatch = await bcrypt.compare(req.body.password, user.password);
    } catch (error) {
      console.log("Password comparison error:", error.message);
      return res
        .status(400)
        .json({ message: "Username or password is incorrect" });
    }

    if (!passwordMatch) {
      return res
        .status(400)
        .json({ message: "Username or password is incorrect" });
    }

    // get permission from user roles using name (not company-specific)
    const permissions = await prisma.role.findFirst({
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

    if (!permissions) {
      return res
        .status(400)
        .json({ message: "Role not found" });
    }

    // store all permissions name to an array
    const permissionNames = permissions.rolePermission.map(
      (rp) => rp.permission.name
    );
    // console.log("permissionNames", permissionNames);
    
    const token = jwt.sign(
      { sub: user.id, permissions: permissionNames, isRequired: false },
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

// Super admin login
const superAdminLogin = async (req, res) => {
  try {
    if (!req.body.username || !req.body.password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    // Find user by username
    const user = await prisma.user.findFirst({
      where: {
        username: req.body.username,
        is_super_admin: true, // Only allow super admin users
      },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Username or password is incorrect" });
    }

    // Compare password
    let passwordMatch = false;
    try {
      passwordMatch = await bcrypt.compare(req.body.password, user.password);
    } catch (error) {
      console.log("Password comparison error:", error.message);
      return res
        .status(400)
        .json({ message: "Username or password is incorrect" });
    }

    if (!passwordMatch) {
      return res
        .status(400)
        .json({ message: "Username or password is incorrect" });
    }

    // Super admin gets all permissions - we'll use a special permission array
    const allPermissions = ["superAdmin"]; // Special permission for super admin
    
    const token = jwt.sign(
      { sub: user.id, permissions: allPermissions, isSuperAdmin: true, isRequired: false },
      secret,
      {
        expiresIn: "24h",
      }
    );
    
    const { password, ...userWithoutPassword } = user;
    return res.json({
      ...userWithoutPassword,
      token,
      isSuperAdmin: true,
    });
  } catch (error) {
    console.error("Super admin login error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Generate 6-digit code
const generateResetCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Forgot password - send 6-digit code via email
const forgotPassword = async (req, res) => {
  try {
    if (!req.body.email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Find user by email
    const user = await prisma.user.findFirst({
      where: {
        email: req.body.email,
      },
    });

    if (!user) {
      // Don't reveal if user exists or not for security
      return res.status(200).json({ 
        message: "If the email exists, a password reset code has been sent." 
      });
    }

    // Generate 6-digit code
    const resetCode = generateResetCode();

    // Store code in cache with 10 minutes TTL (600 seconds)
    const cacheKey = `password_reset:${user.email}`;
    const cacheData = {
      code: resetCode,
      userId: user.id,
      email: user.email,
      createdAt: new Date().toISOString(),
    };
    
    const cacheResult = await cacheService.set(cacheKey, cacheData, 600);
    
    if (!cacheResult) {
      console.warn("Cache not available, storing in memory fallback");
      // Fallback: Store in memory if Redis is not available
      if (!global.passwordResetCodes) {
        global.passwordResetCodes = new Map();
      }
      global.passwordResetCodes.set(cacheKey, {
        ...cacheData,
        expiresAt: Date.now() + (600 * 1000), // 10 minutes from now
      });
    }
    
    console.log("Password reset code stored for:", user.email, "Code:", resetCode);

    // Send email with code
    const emailResult = await sendPasswordResetCode(user.email, resetCode);

    if (!emailResult.success) {
      console.error("Failed to send email:", emailResult.error);
      return res.status(500).json({ 
        message: "Failed to send password reset code. Please try again later." 
      });
    }

    return res.status(200).json({ 
      message: "Password reset code has been sent to your email." 
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Login with code - returns token with isRequired=true
const loginWithCode = async (req, res) => {
  try {
    if (!req.body.email || !req.body.code) {
      return res.status(400).json({ message: "Email and code are required" });
    }

    // Get code from cache
    const cacheKey = `password_reset:${req.body.email}`;
    let cachedData = await cacheService.get(cacheKey);

    // Fallback to in-memory storage if Redis is not available
    if (!cachedData && global.passwordResetCodes) {
      const memoryData = global.passwordResetCodes.get(cacheKey);
      if (memoryData) {
        // Check if expired
        if (Date.now() > memoryData.expiresAt) {
          global.passwordResetCodes.delete(cacheKey);
          return res.status(400).json({ 
            message: "Invalid or expired code. Please request a new code." 
          });
        }
        cachedData = {
          code: memoryData.code,
          userId: memoryData.userId,
          email: memoryData.email,
        };
      }
    }

    if (!cachedData) {
      console.log("No cached data found for:", req.body.email);
      return res.status(400).json({ 
        message: "Invalid or expired code. Please request a new code." 
      });
    }

    console.log("Retrieved code from cache for:", req.body.email, "Expected:", cachedData.code, "Received:", req.body.code);

    // Verify code
    if (cachedData.code !== req.body.code) {
      console.log("Code mismatch - Expected:", cachedData.code, "Received:", req.body.code);
      return res.status(400).json({ message: "Invalid code" });
    }

    // Find user
    const user = await prisma.user.findFirst({
      where: {
        id: cachedData.userId,
        email: req.body.email,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get permissions
    const permissions = await prisma.role.findFirst({
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

    if (!permissions) {
      return res.status(400).json({ message: "Role not found" });
    }

    const permissionNames = permissions.rolePermission.map(
      (rp) => rp.permission.name
    );

    // Generate token with isRequired=true
    const token = jwt.sign(
      { sub: user.id, permissions: permissionNames, isRequired: true },
      secret,
      {
        expiresIn: "1h", // Shorter expiry for password reset tokens
      }
    );

    // Delete the code from cache after successful login
    await cacheService.del(cacheKey);
    // Also delete from memory fallback if exists
    if (global.passwordResetCodes) {
      global.passwordResetCodes.delete(cacheKey);
    }

    const { password, ...userWithoutPassword } = user;
    return res.json({
      ...userWithoutPassword,
      token,
      isRequired: true, // Flag to indicate password change is required
    });
  } catch (error) {
    console.error("Login with code error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Change password - requires token with isRequired=true
const changePassword = async (req, res) => {
  try {
    if (!req.body.newPassword) {
      return res.status(400).json({ message: "New password is required" });
    }

    // Check if token has isRequired flag
    if (!req.auth.isRequired) {
      return res.status(403).json({ 
        message: "This endpoint requires a password reset token. Please use forgot password flow." 
      });
    }

    const userId = req.auth.sub;

    // Hash new password
    const hash = await bcrypt.hash(req.body.newPassword, saltRounds);

    // Update user password
    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        password: hash,
      },
    });

    // Get user with permissions for new token
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get permissions
    const permissions = await prisma.role.findFirst({
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

    if (!permissions) {
      return res.status(400).json({ message: "Role not found" });
    }

    const permissionNames = permissions.rolePermission.map(
      (rp) => rp.permission.name
    );

    // Generate new token with isRequired=false
    const token = jwt.sign(
      { sub: user.id, permissions: permissionNames, isRequired: false },
      secret,
      {
        expiresIn: "24h",
      }
    );

    const { password, ...userWithoutPassword } = user;
    return res.json({
      message: "Password changed successfully",
      user: userWithoutPassword,
      token,
      isRequired: false,
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: error.message });
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
  signup,
  login,
  superAdminLogin,
  forgotPassword,
  loginWithCode,
  changePassword,
  register,
  getAllUser,
  getSingleUser,
  updateSingleUser,
  deleteSingleUser,
};
