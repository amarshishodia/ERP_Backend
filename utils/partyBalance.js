/**
 * List-view balances: opening_balance + receivable/payable from invoices (per company).
 * Uses the same per-invoice logic as account `customer-summary` / `supplier-summary`
 * (sum of due_amount), with numeric IDs so Map lookups always match customer.id / supplier.id.
 */

function addDue(map, partyId, amount) {
  const id = Number(partyId);
  if (!id || Number.isNaN(id)) return;
  const d = Number(amount);
  if (!Number.isFinite(d)) return;
  map.set(id, (map.get(id) || 0) + d);
}

/**
 * Sum sale invoice due per customer — mirrors customer-summary aggregation (findMany + sum due_amount).
 */
async function sumSaleDueByCustomerId(prisma, companyId) {
  const cid = Number(companyId);
  if (!cid || Number.isNaN(cid)) return new Map();

  const invoices = await prisma.saleInvoice.findMany({
    where: { company_id: cid },
    select: {
      customer_id: true,
      due_amount: true,
    },
  });

  const map = new Map();
  for (const inv of invoices) {
    addDue(map, inv.customer_id, inv.due_amount ?? 0);
  }
  return map;
}

/**
 * Sum purchase invoice due per supplier — mirrors supplier-summary.
 */
async function sumPurchaseDueBySupplierId(prisma, companyId) {
  const cid = Number(companyId);
  if (!cid || Number.isNaN(cid)) return new Map();

  const invoices = await prisma.purchaseInvoice.findMany({
    where: { company_id: cid },
    select: {
      supplier_id: true,
      due_amount: true,
    },
  });

  const map = new Map();
  for (const inv of invoices) {
    addDue(map, inv.supplier_id, inv.due_amount ?? 0);
  }
  return map;
}

function attachCustomerBalance(customers, dueByCustomerId) {
  return customers.map((c) => {
    const id = Number(c.id);
    const invDue = Number(dueByCustomerId.get(id)) || 0;
    const opening = Number(c.opening_balance) || 0;
    const balance = Math.round((opening + invDue) * 100) / 100;
    return {
      ...c,
      balance,
      invoice_due_total: invDue,
    };
  });
}

function attachSupplierBalance(suppliers, dueBySupplierId) {
  return suppliers.map((s) => {
    const id = Number(s.id);
    const invDue = Number(dueBySupplierId.get(id)) || 0;
    const opening = Number(s.opening_balance) || 0;
    const balance = Math.round((opening + invDue) * 100) / 100;
    return {
      ...s,
      balance,
      invoice_due_total: invDue,
    };
  });
}

module.exports = {
  sumSaleDueByCustomerId,
  sumPurchaseDueBySupplierId,
  attachCustomerBalance,
  attachSupplierBalance,
};
