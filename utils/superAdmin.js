var { expressjwt: jwt } = require("express-jwt");
require("dotenv").config();
const prisma = require("./prisma");
const secret = process.env.JWT_SECRET;

/**
 * Middleware to check if user is super admin
 * This middleware should be used after the regular authorize middleware
 */
function requireSuperAdmin() {
  return async (req, res, next) => {
    try {
      // Get user ID from JWT token (set by authorize middleware)
      const userId = req.auth?.sub;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - No user ID found" });
      }

      // Check if user is super admin
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { is_super_admin: true }
      });

      if (!user || !user.is_super_admin) {
        return res.status(403).json({ message: "Forbidden - Super admin access required" });
      }

      // User is super admin, proceed
      next();
    } catch (error) {
      console.error("Super admin check error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}

module.exports = requireSuperAdmin;
