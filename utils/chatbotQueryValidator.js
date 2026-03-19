const { Parser } = require("node-sql-parser");
const { TABLES_WITH_COMPANY_ID } = require("./chatbotSchema");

const parser = new Parser();
const opt = { database: "MySQL" };

// All allowed tables (company-scoped + non-company-scoped)
const ALLOWED_TABLES = new Set([
  "user",
  "designation",
  "product",
  "product_category",
  "product_product_category",
  "book_publisher",
  "product_currency",
  "product_currency_rate",
  "supplier",
  "purchaseInvoice",
  "purchaseInvoiceProduct",
  "customer",
  "saleInvoice",
  "saleInvoiceProduct",
  "transaction",
  "role",
  "permission",
  "rolePermission",
  "account",
  "subAccount",
  "returnPurchaseInvoice",
  "returnPurchaseInvoiceProduct",
  "returnSaleInvoice",
  "returnSaleInvoiceProduct",
  "quotationInvoice",
  "quotationInvoiceProduct",
  "challanInvoice",
  "challanInvoiceProduct",
  "appSetting",
  "product_stock",
  "location",
  "stock",
  "product_purchase_history",
  "product_sale_history",
  "discount_master",
  "ecommerce_order",
  "ecommerce_order_item",
  "sales_order",
  "sales_order_item",
  "purchase_order",
  "purchase_order_item",
]);

const FORBIDDEN_KEYWORDS = [
  "DROP",
  "DELETE",
  "INSERT",
  "UPDATE",
  "TRUNCATE",
  "ALTER",
  "CREATE",
  "GRANT",
  "REVOKE",
  "EXEC",
  "EXECUTE",
  "CALL",
];

/**
 * Extract table names from parser tableList result.
 * Format: "select::null::tableName" or "select::db::tableName"
 */
function extractTableNames(tableList) {
  if (!Array.isArray(tableList)) return [];
  return tableList
    .map((t) => {
      const parts = String(t).split("::");
      return parts.length >= 3 ? parts[2] : parts[parts.length - 1];
    })
    .filter(Boolean);
}

/**
 * Validate SQL and inject company_id for company-scoped tables.
 * Returns { valid: boolean, sql?: string, params?: any[], error?: string }
 */
function validateAndPrepareQuery(rawSql, companyId) {
  const sql = (rawSql || "").trim();
  if (!sql) {
    return { valid: false, error: "Empty query." };
  }

  // Only allow SELECT (case insensitive)
  const upperSql = sql.toUpperCase();
  if (!upperSql.startsWith("SELECT")) {
    return { valid: false, error: "Only SELECT queries are allowed." };
  }

  // Check for forbidden keywords
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (upperSql.includes(kw.toUpperCase())) {
      return { valid: false, error: `Query contains forbidden keyword: ${kw}` };
    }
  }

  let ast;
  try {
    ast = parser.astify(sql, opt);
  } catch (err) {
    return { valid: false, error: `Invalid SQL: ${err.message}` };
  }

  // Handle multiple statements - only allow single SELECT
  const statements = Array.isArray(ast) ? ast : [ast];
  if (statements.length > 1) {
    return { valid: false, error: "Only single SELECT statement allowed." };
  }

  const stmt = statements[0];
  if (stmt.type !== "select") {
    return { valid: false, error: "Only SELECT queries are allowed." };
  }

  let tableList;
  try {
    tableList = parser.tableList(sql, opt);
  } catch (_) {
    tableList = [];
  }

  const tables = extractTableNames(tableList);
  if (tables.length === 0) {
    return { valid: false, error: "Could not parse tables from query." };
  }

  // Validate all tables are allowed
  for (const t of tables) {
    const tableName = t.replace(/`/g, "");
    if (!ALLOWED_TABLES.has(tableName)) {
      return { valid: false, error: `Table "${tableName}" is not allowed.` };
    }
  }

  const companyScopedTables = tables.filter((t) =>
    TABLES_WITH_COMPANY_ID.has(t.replace(/`/g, ""))
  );

  if (companyScopedTables.length > 0 && companyId == null) {
    return {
      valid: false,
      error: "Query uses company-scoped tables but user has no company_id.",
    };
  }

  // If no company-scoped tables, execute as-is
  if (companyScopedTables.length === 0) {
    return { valid: true, sql, params: [] };
  }

  // Inject company_id into WHERE clause for each company-scoped table
  // We need to get table aliases from the AST
  const tableAliases = extractTableAliases(stmt);
  const conditions = [];
  const params = [];

  for (const tbl of companyScopedTables) {
    const cleanName = tbl.replace(/`/g, "");
    const alias = tableAliases[cleanName] || cleanName;
    conditions.push(`\`${alias}\`.\`company_id\` = ?`);
    params.push(companyId);
  }

  const companyFilter = conditions.join(" AND ");
  let finalSql = sql;

  if (stmt.where) {
    // Add our conditions to existing WHERE: "WHERE x" -> "WHERE (companyFilter) AND (x)"
    const whereStr = " WHERE ";
    const whereIdx = upperSql.indexOf(whereStr);
    if (whereIdx >= 0) {
      const insertPos = whereIdx + whereStr.length;
      finalSql =
        sql.slice(0, insertPos) +
        `(${companyFilter}) AND (` +
        sql.slice(insertPos) +
        ")";
    } else {
      finalSql = sql + ` WHERE ${companyFilter}`;
    }
  } else {
    // No WHERE - insert before GROUP BY, ORDER BY, LIMIT
    const groupIdx = upperSql.indexOf(" GROUP BY");
    const orderIdx = upperSql.indexOf(" ORDER BY");
    const limitIdx = upperSql.indexOf(" LIMIT ");
    let insertPos = sql.length;
    if (groupIdx >= 0) insertPos = Math.min(insertPos, groupIdx);
    if (orderIdx >= 0) insertPos = Math.min(insertPos, orderIdx);
    if (limitIdx >= 0) insertPos = Math.min(insertPos, limitIdx);
    finalSql = sql.slice(0, insertPos).trimEnd() + ` WHERE ${companyFilter} ` + sql.slice(insertPos);
  }

  return { valid: true, sql: finalSql, params };
}

/**
 * Extract table names and their aliases from SELECT AST.
 * From is array of { table, as?, join?, on? }
 */
function extractTableAliases(ast) {
  const result = {};
  const from = ast.from;
  if (!from || !Array.isArray(from)) return result;

  for (const item of from) {
    if (item && item.table) {
      const tableName = String(item.table).replace(/`/g, "");
      const alias = item.as ? String(item.as).replace(/`/g, "") : tableName;
      result[tableName] = alias;
    }
  }
  return result;
}

module.exports = {
  validateAndPrepareQuery,
  extractTableNames,
};
