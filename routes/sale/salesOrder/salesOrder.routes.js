const express = require("express");
const router = express.Router();
const authorize = require("../../../utils/authorize");
const {
  createSalesOrder,
  getAllSalesOrders,
  getSalesOrderById,
  updateSalesOrder,
  deleteSalesOrder,
  updateOrderItemFulfillment,
} = require("./salesOrder.controllers");
const {
  getOrderPendingItems,
  getOrderCompletionReport,
  getOrderStatusSummary,
  getCustomerOrderHistory,
} = require("./salesOrderReports.controllers");
const {
  upload: uploadCustomerPO,
  analyzeCustomerPO,
  analyzeNewItems: analyzeNewItemsForPO,
} = require("./customerPOAnalysis.controllers");

router.post("/", authorize("createSaleInvoice"), createSalesOrder);
router.get("/", authorize("viewSaleInvoice"), getAllSalesOrders);
router.get("/:id", authorize("viewSaleInvoice"), getSalesOrderById);
router.put("/:id", authorize("updateSaleInvoice"), updateSalesOrder);
router.delete("/:id", authorize("deleteSaleInvoice"), deleteSalesOrder);
router.put("/:id/fulfillment", authorize("updateSaleInvoice"), updateOrderItemFulfillment);

// Reports routes
router.get("/reports/pending-items", authorize("viewSaleInvoice"), getOrderPendingItems);
router.get("/reports/completion", authorize("viewSaleInvoice"), getOrderCompletionReport);
router.get("/reports/status-summary", authorize("viewSaleInvoice"), getOrderStatusSummary);
router.get("/reports/customer/:customer_id", authorize("viewSaleInvoice"), getCustomerOrderHistory);

// Customer PO Analysis routes
router.post("/analyze-customer-po", authorize("createSaleInvoice"), uploadCustomerPO.array('files', 10), analyzeCustomerPO);
router.post("/analyze-new-items", authorize("createSaleInvoice"), analyzeNewItemsForPO);

module.exports = router;
