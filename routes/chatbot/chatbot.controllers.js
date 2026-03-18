const prisma = require("../../utils/prisma");
const { getCompanyId } = require("../../utils/company");
const OpenAI = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const UNAVAILABLE_MSG =
  "I cannot answer this query. You are not associated with a company. Please contact your administrator.";

const SYSTEM_PROMPT = `You are an ERP assistant for a books/business management system. You help users with questions about their business data.

RULES:
1. ONLY answer questions related to this ERP app: products, customers, suppliers, sales, purchases, stock, invoices, payments, etc.
2. If the user asks something unrelated (weather, general knowledge, etc.), politely say you can only help with ERP data.
3. Use the tools provided to fetch real data. Do NOT make up numbers.
4. When referring to customers/suppliers mentioned in conversation (e.g. "Inmantec", "company name is X"), use that name in tool calls.
5. Be concise and friendly. Format currency as ₹X with Indian number formatting.
6. If a tool returns "company_id not available", tell the user they need to be associated with a company.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_customer_dues",
      description: "Get the outstanding/pending payment amount a customer owes. Use when user asks about payment, dues, balance, amount to pay for a customer.",
      parameters: {
        type: "object",
        properties: {
          customer_name: {
            type: "string",
            description: "Customer or company name (e.g. Inmantec, ABC Ltd)",
          },
        },
        required: ["customer_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_count",
      description: "Get total count of active products in the system.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_search",
      description: "Search products by ISBN, name, author, or SKU.",
      parameters: {
        type: "object",
        properties: {
          search_term: {
            type: "string",
            description: "Search term - ISBN, product name, author, or SKU",
          },
        },
        required: ["search_term"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_details",
      description: "Get full details of a product by ISBN or name.",
      parameters: {
        type: "object",
        properties: {
          identifier: {
            type: "string",
            description: "Product ISBN or name",
          },
        },
        required: ["identifier"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_count",
      description: "Get count of active customers.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_supplier_count",
      description: "Get count of active suppliers.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sale_summary",
      description: "Get sales summary - total invoices, this month, today, total amount.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_purchase_summary",
      description: "Get purchase summary - total invoices, this month, today, total amount.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_low_stock",
      description: "Get products with low stock or below reorder level.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_category_count",
      description: "Get count of product categories.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_publisher_count",
      description: "Get count of book publishers.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_most_selling_products",
      description: "Get the best-selling or top-selling books/products by quantity sold. Use when user asks which book/product is selling the most, best seller, top seller, most popular, etc.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of top products to return (default 10)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_most_profitable_customers",
      description: "Get the most profitable customers by total profit from sales. Use when user asks about most profitable customer, top customer by profit, best customer, highest profit customer, etc.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of top customers (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_customers_by_sales",
      description: "Get top customers by total sales amount (who bought the most). Use for: top customer by sales, customer who bought the most, biggest customer, largest customer by purchase, etc.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of top customers (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_suppliers_by_purchase",
      description: "Get top suppliers by total purchase amount (we bought the most from). Use for: top supplier, biggest supplier, most purchased from supplier, largest supplier by amount, etc.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of top suppliers (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_most_profitable_products",
      description: "Get most profitable products/books by total profit from sales. Use for: most profitable book, best profit product, top product by profit, etc.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of top products (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_sale_invoices",
      description: "Get largest/biggest sale invoices by total amount. Use for: largest sale, biggest sale invoice, top sale by amount, highest sale invoice, etc.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of invoices (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_purchase_invoices",
      description: "Get largest/biggest purchase invoices by total amount. Use for: largest purchase, biggest purchase invoice, top purchase by amount, highest purchase invoice, etc.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of invoices (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_challan_invoices",
      description: "Get largest/biggest challan invoices by total amount. Use for: largest challan, biggest challan, top challan by amount, etc.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of challans (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_quotation_invoices",
      description: "Get largest/biggest quotation invoices by total amount. Use for: largest quotation, biggest quotation, top quotation by amount, etc.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of quotations (default 10)" },
        },
      },
    },
  },
];

/**
 * Execute a tool and return result
 */
async function executeTool(name, args, companyId) {
  const needsCompany = [
    "get_customer_dues",
    "get_customer_count",
    "get_supplier_count",
    "get_sale_summary",
    "get_purchase_summary",
    "get_low_stock",
    "get_category_count",
    "get_publisher_count",
    "get_most_selling_products",
    "get_most_profitable_customers",
    "get_top_customers_by_sales",
    "get_top_suppliers_by_purchase",
    "get_most_profitable_products",
    "get_top_sale_invoices",
    "get_top_purchase_invoices",
    "get_top_challan_invoices",
    "get_top_quotation_invoices",
  ].includes(name);

  if (needsCompany && !companyId) {
    return JSON.stringify({ error: UNAVAILABLE_MSG });
  }

  try {
    switch (name) {
      case "get_customer_dues": {
        const customerName = (args.customer_name || "").trim();
        if (!customerName) return JSON.stringify({ error: "Please specify customer name." });
        const customer = await prisma.customer.findFirst({
          where: {
            company_id: companyId,
            status: true,
            name: { contains: customerName },
          },
        });
        if (!customer)
          return JSON.stringify({ error: `No customer found matching "${customerName}".` });
        const agg = await prisma.saleInvoice.aggregate({
          where: { company_id: companyId, customer_id: customer.id },
          _sum: { due_amount: true },
        });
        const due = agg._sum?.due_amount ?? 0;
        return JSON.stringify({
          customer_name: customer.name,
          due_amount: due,
          message: `${customer.name} has to pay ₹${due.toLocaleString("en-IN")}`,
        });
      }

      case "get_product_count": {
        const count = await prisma.product.count({ where: { status: true } });
        return JSON.stringify({ count, message: `There are ${count} active products.` });
      }

      case "get_product_search": {
        const term = (args.search_term || "").trim();
        if (!term) return JSON.stringify({ error: "Please specify search term." });
        const products = await prisma.product.findMany({
          where: {
            status: true,
            OR: [
              { name: { contains: term } },
              { isbn: { contains: term } },
              { author: { contains: term } },
              { sku: { contains: term } },
            ],
          },
          take: 10,
          select: { name: true, isbn: true, author: true, sale_price: true },
        });
        return JSON.stringify({
          count: products.length,
          products: products.map((p) => ({
            name: p.name || "N/A",
            isbn: p.isbn,
            author: p.author || "N/A",
            sale_price: p.sale_price,
          })),
        });
      }

      case "get_product_details": {
        const id = (args.identifier || "").trim();
        if (!id) return JSON.stringify({ error: "Please specify product ISBN or name." });
        const product = await prisma.product.findFirst({
          where: {
            status: true,
            OR: [
              { isbn: id },
              { isbn: { contains: id } },
              { name: { contains: id } },
            ],
          },
          include: {
            product_category: { select: { name: true } },
            book_publisher: { select: { name: true } },
            product_currency: { select: { name: true, symbol: true } },
          },
        });
        if (!product) return JSON.stringify({ error: `No product found for "${id}".` });
        return JSON.stringify({
          name: product.name,
          isbn: product.isbn,
          author: product.author,
          sale_price: product.sale_price,
          purchase_price: product.purchase_price,
          category: product.product_category?.name,
          publisher: product.book_publisher?.name,
          currency: product.product_currency?.name,
        });
      }

      case "get_customer_count": {
        const count = await prisma.customer.count({
          where: { company_id: companyId, status: true },
        });
        return JSON.stringify({ count, message: `Your company has ${count} active customers.` });
      }

      case "get_supplier_count": {
        const count = await prisma.supplier.count({
          where: { company_id: companyId, status: true },
        });
        return JSON.stringify({ count, message: `Your company has ${count} active suppliers.` });
      }

      case "get_sale_summary": {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const [totalCount, monthCount, todayCount, totalAmount] = await Promise.all([
          prisma.saleInvoice.count({ where: { company_id: companyId } }),
          prisma.saleInvoice.count({
            where: { company_id: companyId, date: { gte: startOfMonth } },
          }),
          prisma.saleInvoice.count({
            where: { company_id: companyId, date: { gte: startOfToday } },
          }),
          prisma.saleInvoice.aggregate({
            where: { company_id: companyId },
            _sum: { total_amount: true },
          }),
        ]);
        const total = totalAmount._sum?.total_amount || 0;
        return JSON.stringify({
          total_invoices: totalCount,
          this_month: monthCount,
          today: todayCount,
          total_amount: total,
          message: `Sales: ${totalCount} invoices, this month ${monthCount}, today ${todayCount}. Total: ₹${total.toLocaleString("en-IN")}`,
        });
      }

      case "get_purchase_summary": {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const [totalCount, monthCount, todayCount, totalAmount] = await Promise.all([
          prisma.purchaseInvoice.count({ where: { company_id: companyId } }),
          prisma.purchaseInvoice.count({
            where: { company_id: companyId, date: { gte: startOfMonth } },
          }),
          prisma.purchaseInvoice.count({
            where: { company_id: companyId, date: { gte: startOfToday } },
          }),
          prisma.purchaseInvoice.aggregate({
            where: { company_id: companyId },
            _sum: { total_amount: true },
          }),
        ]);
        const total = totalAmount._sum?.total_amount || 0;
        return JSON.stringify({
          total_invoices: totalCount,
          this_month: monthCount,
          today: todayCount,
          total_amount: total,
          message: `Purchases: ${totalCount} invoices, this month ${monthCount}, today ${todayCount}. Total: ₹${total.toLocaleString("en-IN")}`,
        });
      }

      case "get_low_stock": {
        const allStock = await prisma.product_stock.findMany({
          where: { company_id: companyId },
          include: { product: { select: { name: true, isbn: true } } },
        });
        const belowReorder = allStock.filter(
          (ps) => ps.reorder_quantity != null && ps.quantity <= ps.reorder_quantity
        );
        const veryLow = allStock.filter(
          (ps) => ps.reorder_quantity == null && ps.quantity <= 5
        );
        const items = [...belowReorder, ...veryLow].slice(0, 15);
        return JSON.stringify({
          count: items.length,
          items: items.map((ps) => ({
            name: ps.product?.name || "N/A",
            isbn: ps.product?.isbn,
            quantity: ps.quantity,
            reorder_quantity: ps.reorder_quantity,
          })),
        });
      }

      case "get_category_count": {
        const count = await prisma.product_category.count({
          where: { company_id: companyId },
        });
        return JSON.stringify({ count, message: `Your company has ${count} product categories.` });
      }

      case "get_publisher_count": {
        const count = await prisma.book_publisher.count({
          where: { company_id: companyId },
        });
        return JSON.stringify({ count, message: `Your company has ${count} book publishers.` });
      }

      case "get_most_selling_products": {
        const limit = Math.min(Math.max(parseInt(args.limit, 10) || 10, 1), 20);
        const grouped = await prisma.product_sale_history.groupBy({
          by: ["product_id"],
          where: { company_id: companyId },
          _sum: { quantity: true },
        });
        const sorted = grouped
          .filter((g) => (g._sum?.quantity || 0) > 0)
          .sort((a, b) => (b._sum?.quantity || 0) - (a._sum?.quantity || 0))
          .slice(0, limit);
        if (sorted.length === 0) {
          return JSON.stringify({
            products: [],
            message: "No sales data found for your company.",
          });
        }
        const productIds = sorted.map((s) => s.product_id);
        const products = await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, isbn: true, author: true },
        });
        const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
        const result = sorted.map((s, idx) => {
          const p = productMap[s.product_id];
          return {
            rank: idx + 1,
            name: p?.name || "N/A",
            isbn: p?.isbn || "N/A",
            author: p?.author || "N/A",
            quantity_sold: s._sum?.quantity || 0,
          };
        });
        return JSON.stringify({
          products: result,
          top_seller: result[0],
          message: result[0]
            ? `Best selling: "${result[0].name}" (${result[0].quantity_sold} units sold)`
            : "No sales data.",
        });
      }

      case "get_most_profitable_customers": {
        const limit = Math.min(Math.max(parseInt(args.limit, 10) || 10, 1), 20);
        const grouped = await prisma.saleInvoice.groupBy({
          by: ["customer_id"],
          where: { company_id: companyId },
          _sum: { profit: true },
        });
        const sorted = grouped
          .filter((g) => (g._sum?.profit || 0) > 0)
          .sort((a, b) => (b._sum?.profit || 0) - (a._sum?.profit || 0))
          .slice(0, limit);
        if (sorted.length === 0) {
          return JSON.stringify({
            customers: [],
            message: "No profit data found for your company.",
          });
        }
        const customerIds = sorted.map((s) => s.customer_id);
        const customers = await prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true, phone: true },
        });
        const customerMap = Object.fromEntries(customers.map((c) => [c.id, c]));
        const result = sorted.map((s, idx) => {
          const c = customerMap[s.customer_id];
          return {
            rank: idx + 1,
            name: c?.name || "N/A",
            phone: c?.phone || "N/A",
            total_profit: s._sum?.profit || 0,
          };
        });
        return JSON.stringify({
          customers: result,
          top_customer: result[0],
          message: result[0]
            ? `Most profitable: "${result[0].name}" (₹${(result[0].total_profit || 0).toLocaleString("en-IN")} profit)`
            : "No profit data.",
        });
      }

      case "get_top_customers_by_sales": {
        const limit = Math.min(Math.max(parseInt(args.limit, 10) || 10, 1), 20);
        const grouped = await prisma.saleInvoice.groupBy({
          by: ["customer_id"],
          where: { company_id: companyId },
          _sum: { total_amount: true },
        });
        const sorted = grouped
          .filter((g) => (g._sum?.total_amount || 0) > 0)
          .sort((a, b) => (b._sum?.total_amount || 0) - (a._sum?.total_amount || 0))
          .slice(0, limit);
        if (sorted.length === 0) {
          return JSON.stringify({ customers: [], message: "No sales data found." });
        }
        const customers = await prisma.customer.findMany({
          where: { id: { in: sorted.map((s) => s.customer_id) } },
          select: { id: true, name: true },
        });
        const customerMap = Object.fromEntries(customers.map((c) => [c.id, c]));
        const result = sorted.map((s, idx) => ({
          rank: idx + 1,
          name: customerMap[s.customer_id]?.name || "N/A",
          total_sales: s._sum?.total_amount || 0,
        }));
        return JSON.stringify({
          customers: result,
          top_customer: result[0],
          message: result[0]
            ? `Top by sales: "${result[0].name}" (₹${(result[0].total_sales || 0).toLocaleString("en-IN")})`
            : "No data.",
        });
      }

      case "get_top_suppliers_by_purchase": {
        const limit = Math.min(Math.max(parseInt(args.limit, 10) || 10, 1), 20);
        const grouped = await prisma.purchaseInvoice.groupBy({
          by: ["supplier_id"],
          where: { company_id: companyId },
          _sum: { total_amount: true },
        });
        const sorted = grouped
          .filter((g) => (g._sum?.total_amount || 0) > 0)
          .sort((a, b) => (b._sum?.total_amount || 0) - (a._sum?.total_amount || 0))
          .slice(0, limit);
        if (sorted.length === 0) {
          return JSON.stringify({ suppliers: [], message: "No purchase data found." });
        }
        const suppliers = await prisma.supplier.findMany({
          where: { id: { in: sorted.map((s) => s.supplier_id) } },
          select: { id: true, name: true },
        });
        const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s]));
        const result = sorted.map((s, idx) => ({
          rank: idx + 1,
          name: supplierMap[s.supplier_id]?.name || "N/A",
          total_purchase: s._sum?.total_amount || 0,
        }));
        return JSON.stringify({
          suppliers: result,
          top_supplier: result[0],
          message: result[0]
            ? `Top supplier: "${result[0].name}" (₹${(result[0].total_purchase || 0).toLocaleString("en-IN")})`
            : "No data.",
        });
      }

      case "get_most_profitable_products": {
        const limit = Math.min(Math.max(parseInt(args.limit, 10) || 10, 1), 20);
        const grouped = await prisma.product_sale_history.groupBy({
          by: ["product_id"],
          where: { company_id: companyId },
          _sum: { profit: true },
        });
        const sorted = grouped
          .filter((g) => (g._sum?.profit || 0) > 0)
          .sort((a, b) => (b._sum?.profit || 0) - (a._sum?.profit || 0))
          .slice(0, limit);
        if (sorted.length === 0) {
          return JSON.stringify({ products: [], message: "No profit data found." });
        }
        const products = await prisma.product.findMany({
          where: { id: { in: sorted.map((s) => s.product_id) } },
          select: { id: true, name: true, isbn: true, author: true },
        });
        const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
        const result = sorted.map((s, idx) => ({
          rank: idx + 1,
          name: productMap[s.product_id]?.name || "N/A",
          isbn: productMap[s.product_id]?.isbn || "N/A",
          author: productMap[s.product_id]?.author || "N/A",
          total_profit: s._sum?.profit || 0,
        }));
        return JSON.stringify({
          products: result,
          top_product: result[0],
          message: result[0]
            ? `Most profitable: "${result[0].name}" (₹${(result[0].total_profit || 0).toLocaleString("en-IN")} profit)`
            : "No data.",
        });
      }

      case "get_top_sale_invoices": {
        const limit = Math.min(Math.max(parseInt(args.limit, 10) || 10, 1), 20);
        const invoices = await prisma.saleInvoice.findMany({
          where: { company_id: companyId },
          orderBy: { total_amount: "desc" },
          take: limit,
          include: { customer: { select: { name: true } } },
        });
        const result = invoices.map((inv, idx) => ({
          rank: idx + 1,
          invoice_number: inv.invoice_number,
          prefix: inv.prefix,
          date: inv.date,
          customer: inv.customer?.name || "N/A",
          total_amount: inv.total_amount,
        }));
        return JSON.stringify({
          invoices: result,
          top: result[0],
          message: result[0]
            ? `Largest sale: ${result[0].prefix || ""}${result[0].invoice_number} - ₹${(result[0].total_amount || 0).toLocaleString("en-IN")} (${result[0].customer})`
            : "No sale invoices.",
        });
      }

      case "get_top_purchase_invoices": {
        const limit = Math.min(Math.max(parseInt(args.limit, 10) || 10, 1), 20);
        const invoices = await prisma.purchaseInvoice.findMany({
          where: { company_id: companyId },
          orderBy: { total_amount: "desc" },
          take: limit,
          include: { supplier: { select: { name: true } } },
        });
        const result = invoices.map((inv, idx) => ({
          rank: idx + 1,
          invoice_number: inv.invoice_number,
          prefix: inv.prefix,
          date: inv.date,
          supplier: inv.supplier?.name || "N/A",
          total_amount: inv.total_amount,
        }));
        return JSON.stringify({
          invoices: result,
          top: result[0],
          message: result[0]
            ? `Largest purchase: ${result[0].prefix || ""}${result[0].invoice_number} - ₹${(result[0].total_amount || 0).toLocaleString("en-IN")} (${result[0].supplier})`
            : "No purchase invoices.",
        });
      }

      case "get_top_challan_invoices": {
        const limit = Math.min(Math.max(parseInt(args.limit, 10) || 10, 1), 20);
        const invoices = await prisma.challanInvoice.findMany({
          where: { company_id: companyId },
          orderBy: { total_amount: "desc" },
          take: limit,
          include: { customer: { select: { name: true } } },
        });
        const result = invoices.map((inv, idx) => ({
          rank: idx + 1,
          invoice_number: inv.invoice_number,
          prefix: inv.prefix,
          date: inv.date,
          customer: inv.customer?.name || "N/A",
          total_amount: inv.total_amount,
        }));
        return JSON.stringify({
          challans: result,
          top: result[0],
          message: result[0]
            ? `Largest challan: ${result[0].prefix || ""}${result[0].invoice_number} - ₹${(result[0].total_amount || 0).toLocaleString("en-IN")} (${result[0].customer})`
            : "No challan invoices.",
        });
      }

      case "get_top_quotation_invoices": {
        const limit = Math.min(Math.max(parseInt(args.limit, 10) || 10, 1), 20);
        const invoices = await prisma.quotationInvoice.findMany({
          where: { company_id: companyId },
          orderBy: { total_amount: "desc" },
          take: limit,
          include: { customer: { select: { name: true } } },
        });
        const result = invoices.map((inv, idx) => ({
          rank: idx + 1,
          invoice_number: inv.invoice_number,
          prefix: inv.prefix,
          date: inv.date,
          customer: inv.customer?.name || "N/A",
          total_amount: inv.total_amount,
        }));
        return JSON.stringify({
          quotations: result,
          top: result[0],
          message: result[0]
            ? `Largest quotation: ${result[0].prefix || ""}${result[0].invoice_number} - ₹${(result[0].total_amount || 0).toLocaleString("en-IN")} (${result[0].customer})`
            : "No quotation invoices.",
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    console.error(`Tool ${name} error:`, err);
    return JSON.stringify({ error: "Failed to fetch data. Please try again." });
  }
}

/**
 * Handle chatbot query with LLM
 */
const handleQuery = async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        reply: "Please provide a valid message.",
      });
    }

    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({
        success: false,
        reply: "Please log in to use the chatbot.",
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        reply: "Chatbot is not configured. Please set OPENAI_API_KEY.",
      });
    }

    const companyId = await getCompanyId(userId);

    // Build messages: system + history + current user message
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history
        .filter((m) => m.role && m.content)
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      { role: "user", content: message },
    ];

    let reply = "";
    let currentMessages = [...messages];
    let maxIterations = 5;
    let iter = 0;

    while (iter < maxIterations) {
      iter++;
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: currentMessages,
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: 1024,
        temperature: 0.3,
      });

      const choice = response.choices?.[0];
      if (!choice) {
        reply = "Sorry, I couldn't process that.";
        break;
      }

      const msg = choice.message;

      if (msg.content) {
        reply = msg.content;
        break;
      }

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        currentMessages.push(msg);

        for (const tc of msg.tool_calls) {
          const fn = tc.function;
          const name = fn?.name;
          let args = {};
          try {
            args = JSON.parse(fn?.arguments || "{}");
          } catch (_) {}

          const result = await executeTool(name, args, companyId);

          currentMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        }
      } else {
        reply = "Sorry, I couldn't generate a response.";
        break;
      }
    }

    if (!reply && iter >= maxIterations) {
      reply = "Sorry, I couldn't complete that request. Please try again.";
    }

    return res.json({
      success: true,
      reply,
    });
  } catch (error) {
    console.error("Chatbot error:", error);
    const msg =
      error?.response?.data?.error?.message ||
      error?.message ||
      "Sorry, something went wrong. Please try again.";
    return res.status(500).json({
      success: false,
      reply: msg,
    });
  }
};

module.exports = {
  handleQuery,
};
