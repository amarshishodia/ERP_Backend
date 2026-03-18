const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const prisma = require("../../../utils/prisma");

const createSingleAccount = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // Verify that the account belongs to the user's company
    const account = await prisma.account.findUnique({
      where: { id: Number(req.body.account_id) },
      select: { company_id: true },
    });

    if (!account || account.company_id !== companyId) {
      return res.status(403).json({ error: "Account does not belong to your company" });
    }

    const createdAccount = await prisma.subAccount.create({
      data: {
        name: req.body.name,
        account: {
          connect: {
            id: Number(req.body.account_id),
          },
        },
      },
    });
    res.status(200).json(createdAccount);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const getAllAccount = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }

  if (req.query.query === "tb") {
    try {
      const allAccount = await prisma.account.findMany({
        where: {
          company_id: companyId,
        },
        orderBy: [
          {
            id: "asc",
          },
        ],
        include: {
          subAccount: {
            include: {
              debitTransactions: {
                where: {
                  status: true,
                },
              },
              creditTransactions: {
                where: {
                  status: true,
                },
              },
            },
          },
        },
      });
      // some up all debit and credit amount from each subAccount and add it to every subAccount object
      let tb = {};
      const accountInfo = allAccount.map((account) => {
        return account.subAccount.map((subAccount) => {
          const totalDebit = subAccount.debitTransactions.reduce((acc, debit) => {
            return acc + debit.amount;
          }, 0);
          const totalCredit = subAccount.creditTransactions.reduce((acc, credit) => {
            return acc + credit.amount;
          }, 0);
          return (tb = {
            account: account.name,
            subAccount: subAccount.name,
            totalDebit,
            totalCredit,
            balance: totalDebit - totalCredit,
          });
        });
      });
      // transform accountInfo into an single array
      const trialBalance = accountInfo.flat();
      let debits = [];
      let credits = [];
      trialBalance.forEach((item) => {
        if (item.balance > 0) {
          debits.push(item);
        }
        if (item.balance < 0) {
          // Convert negative balance to positive for credits display
          credits.push({
            ...item,
            balance: Math.abs(item.balance),
          });
        }
      });
      //some up all debit and credit balance
      const totalDebit = debits.reduce((acc, debit) => {
        return acc + debit.balance;
      }, 0);
      const totalCredit = credits.reduce((acc, credit) => {
        return acc + credit.balance;
      }, 0);

      // check if total debit is equal to total credit
      let match = totalDebit === totalCredit;
      
      res.json({ match, totalDebit, totalCredit, debits, credits });
    } catch (error) {
      res.status(400).json({ error: error.message });
      console.log(error.message);
    }
  } else if (req.query.query === "bs") {
    try {
      const allAccount = await prisma.account.findMany({
        where: {
          company_id: companyId,
        },
        orderBy: [
          {
            id: "asc",
          },
        ],
        include: {
          subAccount: {
            include: {
              debitTransactions: {
                where: {
                  status: true,
                },
              },
              creditTransactions: {
                where: {
                  status: true,
                },
              },
            },
          },
        },
      });
      // some up all debit and credit amount from each subAccount and add it to every subAccount object
      let tb = {};
      const accountInfo = allAccount.map((account) => {
        return account.subAccount.map((subAccount) => {
          const totalDebit = subAccount.debitTransactions.reduce((acc, debit) => {
            return acc + debit.amount;
          }, 0);
          const totalCredit = subAccount.creditTransactions.reduce((acc, credit) => {
            return acc + credit.amount;
          }, 0);
          return (tb = {
            account: account.type,
            subAccount: subAccount.name,
            totalDebit,
            totalCredit,
            balance: totalDebit - totalCredit,
          });
        });
      });
      // transform accountInfo into an single array
      const balanceSheet = accountInfo.flat();
      let assets = [];
      let liabilities = [];
      let equity = [];
      balanceSheet.forEach((item) => {
        if (item.account === "Asset" && item.balance !== 0) {
          assets.push(item);
        }
        if (item.account === "Liability" && item.balance !== 0) {
          // convert negative balance to positive and vice versa
          liabilities.push({
            ...item,
            balance: -item.balance,
          });
        }
        if (item.account === "Owner's Equity" && item.balance !== 0) {
          // convert negative balance to positive and vice versa
          equity.push({
            ...item,
            balance: -item.balance,
          });
        }
      });
      //some up all asset, liability and equity balance
      const totalAsset = assets.reduce((acc, asset) => {
        return acc + asset.balance;
      }, 0);
      const totalLiability = liabilities.reduce((acc, liability) => {
        return acc + liability.balance;
      }, 0);
      const totalEquity = equity.reduce((acc, equity) => {
        return acc + equity.balance;
      }, 0);

      // check if total asset is equal to total liability and equity
      let match = totalAsset === totalLiability + totalEquity;
      
      res.json({
        match,
        totalAsset,
        totalLiability,
        totalEquity,
        assets,
        liabilities,
        equity,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
      console.log(error.message);
    }
  } else if (req.query.query === "is" || req.query.query === "pl") {
    // Income Statement and Profit & Loss use same data (Revenue - Expense = Profit/Loss)
    try {
      const allAccount = await prisma.account.findMany({
        where: {
          company_id: companyId,
        },
        orderBy: [
          {
            id: "asc",
          },
        ],
        include: {
          subAccount: {
            include: {
              debitTransactions: {
                where: {
                  status: true,
                },
              },
              creditTransactions: {
                where: {
                  status: true,
                },
              },
            },
          },
        },
      });
      // some up all debit and credit amount from each subAccount and add it to every subAccount object
      let tb = {};
      const accountInfo = allAccount.map((account) => {
        return account.subAccount.map((subAccount) => {
          const totalDebit = subAccount.debitTransactions.reduce((acc, debit) => {
            return acc + debit.amount;
          }, 0);
          const totalCredit = subAccount.creditTransactions.reduce((acc, credit) => {
            return acc + credit.amount;
          }, 0);
          return (tb = {
            id: subAccount.id,
            account: account.name,
            subAccount: subAccount.name,
            totalDebit,
            totalCredit,
            balance: totalDebit - totalCredit,
          });
        });
      });
      // transform accountInfo into an single array
      const incomeStatement = accountInfo.flat();
      let revenue = [];
      let expense = [];
      incomeStatement.forEach((item) => {
        if (item.account === "Revenue" && item.balance !== 0) {
          // convert negative balance to positive and vice versa
          revenue.push({
            ...item,
            balance: -item.balance,
          });
        }
        if (item.account === "Expense" && item.balance !== 0) {
          // convert negative balance to positive and vice versa
          expense.push({
            ...item,
            balance: -item.balance,
          });
        }
      });

      //some up all revenue and expense balance
      const totalRevenue = revenue.reduce((acc, revenue) => {
        return acc + revenue.balance;
      }, 0);
      const totalExpense = expense.reduce((acc, expense) => {
        return acc + expense.balance;
      }, 0);

      res.json({
        totalRevenue,
        totalExpense,
        profit: totalRevenue - totalExpense,
        revenue,
        expense,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
      console.log(error.message);
    }
  } else if (req.query.query == "sa") {
    // subAccount
    try {
      const allSubAccount = await prisma.subAccount.findMany({
        where: {
          account: {
            company_id: companyId,
          },
        },
        orderBy: [
          {
            id: "asc",
          },
        ],
        include: {
          account: {
            select: {
              name: true,
              type: true,
            },
          },
        },
      });
      res.json(allSubAccount);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else if (req.query.query == "ma") {
    // mainAccount
    try {
      const allSubAccount = await prisma.account.findMany({
        where: {
          company_id: companyId,
        },
        orderBy: [
          {
            id: "asc",
          },
        ],
      });
      res.json(allSubAccount);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else if (req.query.query === "party-wise-pl") {
    // Party-wise Profit and Loss: customers (sales + profit), suppliers (purchases)
    try {
      const saleInvoices = await prisma.saleInvoice.findMany({
        where: { company_id: companyId },
        select: {
          customer_id: true,
          total_amount: true,
          profit: true,
          customer: { select: { id: true, name: true } },
        },
      });
      const purchaseInvoices = await prisma.purchaseInvoice.findMany({
        where: { company_id: companyId },
        select: {
          supplier_id: true,
          total_amount: true,
          supplier: { select: { id: true, name: true } },
        },
      });
      const customerMap = new Map();
      saleInvoices.forEach((inv) => {
        const key = inv.customer_id;
        if (!customerMap.has(key)) {
          customerMap.set(key, {
            id: inv.customer?.id,
            name: inv.customer?.name ?? "N/A",
            totalSales: 0,
            profit: 0,
          });
        }
        const row = customerMap.get(key);
        row.totalSales += Number(inv.total_amount);
        row.profit += Number(inv.profit ?? 0);
      });
      const supplierMap = new Map();
      purchaseInvoices.forEach((inv) => {
        const key = inv.supplier_id;
        if (!supplierMap.has(key)) {
          supplierMap.set(key, {
            id: inv.supplier?.id,
            name: inv.supplier?.name ?? "N/A",
            totalPurchases: 0,
          });
        }
        supplierMap.get(key).totalPurchases += Number(inv.total_amount);
      });
      res.json({
        customerWise: Array.from(customerMap.values()),
        supplierWise: Array.from(supplierMap.values()),
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
      console.log(error.message);
    }
  } else if (req.query.query === "customer-summary") {
    try {
      const saleInvoices = await prisma.saleInvoice.findMany({
        where: { company_id: companyId },
        select: {
          customer_id: true,
          total_amount: true,
          paid_amount: true,
          due_amount: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
      });
      const customerMap = new Map();
      saleInvoices.forEach((inv) => {
        const key = inv.customer_id;
        if (!customerMap.has(key)) {
          customerMap.set(key, {
            id: inv.customer?.id,
            name: inv.customer?.name ?? "N/A",
            phone: inv.customer?.phone ?? "",
            total_billed: 0,
            total_received: 0,
            total_due: 0,
            invoice_count: 0,
          });
        }
        const row = customerMap.get(key);
        row.total_billed += Number(inv.total_amount ?? 0);
        row.total_received += Number(inv.paid_amount ?? 0);
        row.total_due += Number(inv.due_amount ?? 0);
        row.invoice_count += 1;
      });
      const list = Array.from(customerMap.values()).sort((a, b) => (b.total_received || 0) - (a.total_received || 0));
      res.json({ list });
    } catch (error) {
      res.status(400).json({ error: error.message });
      console.log(error.message);
    }
  } else if (req.query.query === "supplier-summary") {
    try {
      const purchaseInvoices = await prisma.purchaseInvoice.findMany({
        where: { company_id: companyId },
        select: {
          supplier_id: true,
          total_amount: true,
          paid_amount: true,
          due_amount: true,
          supplier: { select: { id: true, name: true, phone: true } },
        },
      });
      const supplierMap = new Map();
      purchaseInvoices.forEach((inv) => {
        const key = inv.supplier_id;
        if (!supplierMap.has(key)) {
          supplierMap.set(key, {
            id: inv.supplier?.id,
            name: inv.supplier?.name ?? "N/A",
            phone: inv.supplier?.phone ?? "",
            total_billed: 0,
            total_paid: 0,
            total_due: 0,
            invoice_count: 0,
          });
        }
        const row = supplierMap.get(key);
        row.total_billed += Number(inv.total_amount ?? 0);
        row.total_paid += Number(inv.paid_amount ?? 0);
        row.total_due += Number(inv.due_amount ?? 0);
        row.invoice_count += 1;
      });
      const list = Array.from(supplierMap.values()).sort((a, b) => (b.total_paid || 0) - (a.total_paid || 0));
      res.json({ list });
    } catch (error) {
      res.status(400).json({ error: error.message });
      console.log(error.message);
    }
  } else {
    try {
      const allAccount = await prisma.account.findMany({
        where: {
          company_id: companyId,
        },
        orderBy: [
          {
            id: "asc",
          },
        ],
        include: {
          subAccount: {
            include: {
              debitTransactions: true,
              creditTransactions: true,
            },
          },
        },
      });
      res.json(allAccount);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  }
};

const getSingleAccount = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const singleAccount = await prisma.subAccount.findUnique({
      where: {
        id: Number(req.params.id),
      },
      include: {
        account: {
          select: {
            company_id: true,
          },
        },
        debitTransactions: true,
        creditTransactions: true,
      },
    });

    if (!singleAccount) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Verify that the account belongs to the user's company
    if (singleAccount.account.company_id !== companyId) {
      return res.status(403).json({ error: "Account does not belong to your company" });
    }

    // calculate balance from total debit and credit
    const totalDebit = singleAccount.debitTransactions.reduce((acc, debit) => {
      return acc + debit.amount;
    }, 0);
    const totalCredit = singleAccount.creditTransactions.reduce((acc, credit) => {
      return acc + credit.amount;
    }, 0);
    const balance = totalDebit - totalCredit;
    singleAccount.balance = balance;
    res.json(singleAccount);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const updateSingleAccount = async (req, res) => {
  try {
    const updatedAccount = await prisma.subAccount.update({
      where: {
        id: Number(req.params.id),
      },
      data: {
        name: req.body.name,
        account: {
          connect: {
            id: Number(req.body.account_id),
          },
        },
      },
    });
    res.json(updatedAccount);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const deleteSingleAccount = async (req, res) => {
  try {
    const deletedSubAccount = await prisma.subAccount.update({
      where: {
        id: Number(req.params.id),
      },
      data: {
        status: req.body.status,
      },
    });
    res.status(200).json(deletedSubAccount);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const getPartyStatement = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }
    const { type, id: partyId, fromDate, toDate } = req.query;
    if (!type || !partyId) {
      return res.status(400).json({ error: "type (customer|supplier) and id are required" });
    }
    const id = Number(partyId);
    if (type === "customer") {
      const customer = await prisma.customer.findFirst({
        where: { id, company_id: companyId },
        select: { id: true, name: true, phone: true, address: true },
      });
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      const where = { customer_id: id, company_id: companyId };
      if (fromDate || toDate) {
        where.date = {};
        if (fromDate) where.date.gte = new Date(fromDate);
        if (toDate) where.date.lte = new Date(toDate);
      }
      const invoices = await prisma.saleInvoice.findMany({
        where,
        orderBy: { date: "asc" },
        select: {
          id: true,
          date: true,
          invoice_number: true,
          total_amount: true,
          paid_amount: true,
          due_amount: true,
          prefix: true,
        },
      });
      const totalOutstanding = invoices.reduce((sum, inv) => sum + Number(inv.due_amount), 0);
      return res.json({
        party: customer,
        partyType: "customer",
        invoices,
        totalOutstanding,
      });
    }
    if (type === "supplier") {
      const supplier = await prisma.supplier.findFirst({
        where: { id, company_id: companyId },
        select: { id: true, name: true, phone: true, address: true },
      });
      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }
      const where = { supplier_id: id, company_id: companyId };
      if (fromDate || toDate) {
        where.date = {};
        if (fromDate) where.date.gte = new Date(fromDate);
        if (toDate) where.date.lte = new Date(toDate);
      }
      const invoices = await prisma.purchaseInvoice.findMany({
        where,
        orderBy: { date: "asc" },
        select: {
          id: true,
          date: true,
          total_amount: true,
          paid_amount: true,
          due_amount: true,
        },
      });
      const totalOutstanding = invoices.reduce((sum, inv) => sum + Number(inv.due_amount), 0);
      return res.json({
        party: supplier,
        partyType: "supplier",
        invoices,
        totalOutstanding,
      });
    }
    return res.status(400).json({ error: "type must be customer or supplier" });
  } catch (error) {
    res.status(400).json({ error: error.message });
    console.log(error.message);
  }
};

module.exports = {
  createSingleAccount,
  getAllAccount,
  getSingleAccount,
  updateSingleAccount,
  deleteSingleAccount,
  getPartyStatement,
};
