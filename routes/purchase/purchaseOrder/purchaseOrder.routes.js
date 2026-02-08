const express = require("express");
const router = express.Router();
const authorize = require("../../../utils/authorize");
const {
  createPurchaseOrder,
  getAllPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrder,
  deletePurchaseOrder,
  updatePurchaseOrderItemReceived,
} = require("./purchaseOrder.controllers");
const {
  getPurchaseOrderPendingItems,
  getPurchaseOrderCompletionReport,
  getPurchaseOrderStatusSummary,
  getSupplierOrderHistory,
} = require("./purchaseOrderReports.controllers");

router.post("/", authorize("createPurchaseInvoice"), createPurchaseOrder);
router.get("/", authorize("viewPurchaseInvoice"), getAllPurchaseOrders);
router.get("/:id", authorize("viewPurchaseInvoice"), getPurchaseOrderById);
router.put("/:id", authorize("updatePurchaseInvoice"), updatePurchaseOrder);
router.delete("/:id", authorize("deletePurchaseInvoice"), deletePurchaseOrder);
router.put("/:id/received", authorize("updatePurchaseInvoice"), updatePurchaseOrderItemReceived);

// Reports routes
router.get("/reports/pending-items", authorize("viewPurchaseInvoice"), getPurchaseOrderPendingItems);
router.get("/reports/completion", authorize("viewPurchaseInvoice"), getPurchaseOrderCompletionReport);
router.get("/reports/status-summary", authorize("viewPurchaseInvoice"), getPurchaseOrderStatusSummary);
router.get("/reports/supplier/:supplier_id", authorize("viewPurchaseInvoice"), getSupplierOrderHistory);

module.exports = router;
