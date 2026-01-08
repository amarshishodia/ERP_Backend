const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Get company_id from logged-in user
 * @param {number} userId - The user ID from req.auth.sub
 * @returns {Promise<number|null>} - The company_id or null if not found
 */
const getCompanyId = async (userId) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { company_id: true },
    });
    return user?.company_id;
  } catch (error) {
    console.error("Error fetching company_id:", error);
    return null;
  }
};

module.exports = {
  getCompanyId,
};

