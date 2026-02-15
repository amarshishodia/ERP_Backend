const prisma = require("./prisma");

/**
 * Helper function to create a transaction with both main account IDs and sub-account IDs
 * @param {Object} transactionData - Transaction data object
 * @param {Date} transactionData.date - Transaction date
 * @param {number} transactionData.sub_debit_id - Sub-account ID for debit (required)
 * @param {number} transactionData.sub_credit_id - Sub-account ID for credit (required)
 * @param {string} transactionData.particulars - Transaction particulars
 * @param {number} transactionData.amount - Transaction amount
 * @param {string} transactionData.type - Transaction type (optional)
 * @param {number} transactionData.related_id - Related entity ID (optional)
 * @param {number} transactionData.company_id - Company ID (required)
 * @returns {Promise<Object>} Created transaction
 */
const createTransactionWithSubAccounts = async (transactionData) => {
  const { date, sub_debit_id, sub_credit_id, particulars, amount, type, related_id, company_id } = transactionData;

  if (!company_id) {
    throw new Error("company_id is required for transaction creation");
  }

  // Fetch sub-accounts to get their main account IDs
  const subDebitAccount = await prisma.subAccount.findUnique({
    where: { id: sub_debit_id },
    select: { account_id: true }
  });

  const subCreditAccount = await prisma.subAccount.findUnique({
    where: { id: sub_credit_id },
    select: { account_id: true }
  });

  if (!subDebitAccount || !subCreditAccount) {
    throw new Error(`Invalid sub-account IDs: debit_id=${sub_debit_id}, credit_id=${sub_credit_id}`);
  }

  return await prisma.transaction.create({
    data: {
      date: date instanceof Date ? date : new Date(date),
      debit: {
        connect: {
          id: subDebitAccount.account_id,
        },
      },
      credit: {
        connect: {
          id: subCreditAccount.account_id,
        },
      },
      subDebit: {
        connect: {
          id: sub_debit_id,
        },
      },
      subCredit: {
        connect: {
          id: sub_credit_id,
        },
      },
      company: {
        connect: {
          id: company_id,
        },
      },
      particulars: particulars,
      amount: parseFloat(amount),
      type: type || null,
      related_id: related_id || null,
    },
  });
};

module.exports = {
  createTransactionWithSubAccounts,
};


