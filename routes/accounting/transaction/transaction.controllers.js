const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const createSingleTransaction = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // convert all incoming data to a specific format.
    const date = new Date(req.body.date).toISOString().split("T")[0];
    
    // Get sub-account IDs (the form sends sub-account IDs as debit_id and credit_id)
    const subDebitId = Number(req.body.debit_id);
    const subCreditId = Number(req.body.credit_id);
    
    // Fetch sub-accounts to get their main account IDs and verify company_id
    const subDebitAccount = await prisma.subAccount.findUnique({
      where: { id: subDebitId },
      include: {
        account: {
          select: {
            id: true,
            company_id: true,
          },
        },
      },
    });
    
    const subCreditAccount = await prisma.subAccount.findUnique({
      where: { id: subCreditId },
      include: {
        account: {
          select: {
            id: true,
            company_id: true,
          },
        },
      },
    });
    
    if (!subDebitAccount || !subCreditAccount) {
      return res.status(400).json({ error: "Invalid sub-account IDs provided" });
    }

    // Verify that both accounts belong to the user's company
    if (subDebitAccount.account.company_id !== companyId || subCreditAccount.account.company_id !== companyId) {
      return res.status(403).json({ error: "Accounts do not belong to your company" });
    }
    
    const createdTransaction = await prisma.transaction.create({
      data: {
        date: new Date(date),
        debit: {
          connect: {
            id: subDebitAccount.account.id,
          },
        },
        credit: {
          connect: {
            id: subCreditAccount.account.id,
          },
        },
        sub_debit_id: subDebitId,
        sub_credit_id: subCreditId,
        particulars: req.body.particulars,
        amount: parseFloat(req.body.amount),
        company_id: companyId,
      },
    });
    res.status(200).json(createdTransaction);
  } catch (error) {
    res.status(400).json({ error: error.message });
    console.log(error.message);
  }
};

const getAllTransaction = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }

  if (req.query.query === "info") {
    const aggregations = await prisma.transaction.aggregate({
      where: {
        status: true,
        company_id: companyId,
      },
      _count: {
        id: true,
      },
      _sum: {
        amount: true,
      },
    });
    res.json(aggregations);
  } else if (req.query.query === "all") {
    const allTransaction = await prisma.transaction.findMany({
      where: {
        company_id: companyId,
      },
      orderBy: [
        {
          id: "asc",
        },
      ],
      include: {
        debit: {
          select: {
            name: true,
          },
        },
        credit: {
          select: {
            name: true,
          },
        },
      },
    });
    res.json(allTransaction);
  } else if (req.query.query === "inactive") {
    const { skip, limit } = getPagination(req.query);
    try {
      const [aggregations, allTransaction] = await prisma.$transaction([
        // get info of selected parameter data
        prisma.transaction.aggregate({
          _count: {
            id: true,
          },
          _sum: {
            amount: true,
          },
          where: {
            date: {
              gte: new Date(req.query.startdate),
              lte: new Date(req.query.enddate),
            },
            status: false,
            company_id: companyId,
          },
        }),
        // get transaction paginated and by start and end date
        prisma.transaction.findMany({
          orderBy: [
            {
              id: "desc",
            },
          ],
          skip: Number(skip),
          take: Number(limit),
          where: {
            date: {
              gte: new Date(req.query.startdate),
              lte: new Date(req.query.enddate),
            },
            status: false,
            company_id: companyId,
          },
          include: {
            debit: {
              select: {
                name: true,
              },
            },
            credit: {
              select: {
                name: true,
              },
            },
          },
        }),
      ]);
      res.json({ aggregations, allTransaction });
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else {
    const { skip, limit } = getPagination(req.query);
    try {
      const [aggregations, allTransaction] = await prisma.$transaction([
        // get info of selected parameter data
        prisma.transaction.aggregate({
          _count: {
            id: true,
          },
          _sum: {
            amount: true,
          },
          where: {
            date: {
              gte: new Date(req.query.startdate),
              lte: new Date(req.query.enddate),
            },
            status: true,
            company_id: companyId,
          },
        }),
        // get transaction paginated and by start and end date
        prisma.transaction.findMany({
          orderBy: [
            {
              id: "desc",
            },
          ],
          skip: Number(skip),
          take: Number(limit),
          where: {
            date: {
              gte: new Date(req.query.startdate),
              lte: new Date(req.query.enddate),
            },
            status: true,
            company_id: companyId,
          },
          include: {
            debit: {
              select: {
                name: true,
              },
            },
            credit: {
              select: {
                name: true,
              },
            },
          },
        }),
      ]);
      res.json({ aggregations, allTransaction });
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  }
};

const getSingleTransaction = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const singleTransaction = await prisma.transaction.findUnique({
      where: {
        id: Number(req.params.id),
      },
      include: {
        debit: {
          select: {
            name: true,
          },
        },
        credit: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!singleTransaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Verify that the transaction belongs to the user's company
    if (singleTransaction.company_id !== companyId) {
      return res.status(403).json({ error: "Transaction does not belong to your company" });
    }

    res.json(singleTransaction);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

// TODO: update account as per transaction
const updateSingleTransaction = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // Verify that the transaction belongs to the user's company
    const existingTransaction = await prisma.transaction.findUnique({
      where: { id: Number(req.params.id) },
      select: { company_id: true },
    });

    if (!existingTransaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (existingTransaction.company_id !== companyId) {
      return res.status(403).json({ error: "Transaction does not belong to your company" });
    }

    // convert all incoming data to a specific format.
    const date = new Date(req.body.date).toISOString().split("T")[0];
    const updatedTransaction = await prisma.transaction.update({
      where: {
        id: Number(req.params.id),
      },
      data: {
        date: new Date(date),
        particulars: req.body.particulars,
        type: "transaction",
        related_id: 0,
        amount: parseFloat(req.body.amount),
      },
    });
    // TO DO: update transaction account
    res.json(updatedTransaction);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

// delete and update account as per transaction
const deleteSingleTransaction = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // Verify that the transaction belongs to the user's company
    const existingTransaction = await prisma.transaction.findUnique({
      where: { id: Number(req.params.id) },
      select: { company_id: true },
    });

    if (!existingTransaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (existingTransaction.company_id !== companyId) {
      return res.status(403).json({ error: "Transaction does not belong to your company" });
    }

    const deletedTransaction = await prisma.transaction.update({
      where: {
        id: Number(req.params.id),
      },
      data: {
        status: req.body.status,
      },
    });
    res.status(200).json(deletedTransaction);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

module.exports = {
  createSingleTransaction,
  getAllTransaction,
  getSingleTransaction,
  updateSingleTransaction,
  deleteSingleTransaction,
};
