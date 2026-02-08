const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const authorize = require("../../utils/authorize");
const { getCompanyId } = require("../../utils/company");

// Get next temporary ISBN in form NA<next>
const getNextTempIsbn = async (req, res) => {
  try {
    // optional: get company id if you want per-company locking (not used here)
    let companyId = null;
    try {
      companyId = await getCompanyId(req.auth.sub);
    } catch (e) {
      // ignore - companyId may not be required
    }

    const lockName = `next_na_isbn`;
    // Acquire named lock (MySQL GET_LOCK) for atomicity; timeout 10 sec
    await prisma.$executeRawUnsafe(`SELECT GET_LOCK('${lockName}', 10)`);

    try {
      // Find max existing NA number from product ISBNs
      const rows = await prisma.$queryRawUnsafe(
        `SELECT isbn FROM product WHERE isbn REGEXP '^NA[0-9]+$' ORDER BY CAST(SUBSTRING(isbn,3) AS UNSIGNED) DESC LIMIT 1`
      );

      let maxNum = 0;
      if (rows && rows.length > 0 && rows[0].isbn) {
        const m = rows[0].isbn.match(/^NA(\d+)$/i);
        if (m) {
          maxNum = parseInt(m[1], 10) || 0;
        }
      }

      const next = maxNum + 1;
      const tempIsbn = `NA${next}`;

      return res.json({ success: true, tempIsbn, value: next });
    } finally {
      // Release lock
      await prisma.$executeRawUnsafe(`SELECT RELEASE_LOCK('${lockName}')`);
    }
  } catch (error) {
    console.error("Error getting next temp ISBN:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getNextTempIsbn,
};

