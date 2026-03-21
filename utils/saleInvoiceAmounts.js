/**
 * Sale invoice paid / net-billed helpers (aligned with chart from seed).
 * AR=4, Sales=8, COGS=9, discount given=14
 */
const ACCT_RECEIVABLE = 4;
const ACCT_SALES = 8;
const ACCT_COGS = 9;
const ACCT_DISCOUNT_GIVEN = 14;

/**
 * Cash/bank received from customer: initial payment (Cr Sales) + receipts (Cr Receivable).
 * Excludes receivable booking, COGS, payment-time discount write-offs.
 */
function sumSaleCashReceiptAmounts(transactions, saleInvoiceId) {
  return transactions
    .filter(
      (t) =>
        t.type === "sale" &&
        t.related_id === saleInvoiceId &&
        (t.credit_id === ACCT_RECEIVABLE || t.credit_id === ACCT_SALES) &&
        t.debit_id !== ACCT_RECEIVABLE &&
        t.debit_id !== ACCT_COGS &&
        t.debit_id !== ACCT_DISCOUNT_GIVEN
    )
    .reduce((acc, t) => acc + Number(t.amount || 0), 0);
}

/** Net billed after line + bill discounts and round-off */
function netBilledSaleAmount(invoice) {
  const gross = Number(invoice.total_amount || 0);
  const lineDisc = Number(invoice.total_product_discount || 0);
  const billDisc = Number(invoice.discount || 0);
  const round = invoice.round_off_enabled ? Number(invoice.round_off_amount || 0) : 0;
  return gross - lineDisc - billDisc + round;
}

module.exports = {
  sumSaleCashReceiptAmounts,
  netBilledSaleAmount,
  ACCT_RECEIVABLE,
  ACCT_SALES,
};
