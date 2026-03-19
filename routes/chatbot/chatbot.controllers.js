const prisma = require("../../utils/prisma");
const { getCompanyId } = require("../../utils/company");
const OpenAI = require("openai");
const { validateAndPrepareQuery } = require("../../utils/chatbotQueryValidator");
const { SCHEMA_DESCRIPTION } = require("../../utils/chatbotSchema");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are an ERP assistant for a books/business management system. You help users with questions about their business data.

RULES:
1. ONLY answer questions related to this ERP app: products, customers, suppliers, sales, purchases, stock, invoices, payments, etc.
2. If the user asks something unrelated (weather, general knowledge, etc.), politely say you can only help with ERP data.
3. Use the execute_query tool to run SELECT queries against the database. Generate valid MySQL SQL.
4. When querying tables that have company_id, the system will automatically filter by the user's company - you do NOT need to add company_id in your SQL.
5. Be concise and friendly. Format currency as ₹X with Indian number formatting.
6. Use JOINs when you need data from multiple tables (e.g. saleInvoice JOIN customer to get customer names with sales).
7. Limit results to 20 rows unless the user asks for more.
8. If a query fails, try a simpler query or explain what went wrong.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "execute_query",
      description:
        "Execute a SELECT query against the ERP database. Use for ANY question about products, customers, suppliers, sales, purchases, invoices, challan, quotations, stock, etc. Generate valid MySQL. Use JOINs when needed. Tables with company_id are auto-filtered by user's company.",
      parameters: {
        type: "object",
        properties: {
          sql: {
            type: "string",
            description:
              "Valid MySQL SELECT query. Use backticks for identifiers. JOIN tables when you need related data. LIMIT to 20 by default.",
          },
        },
        required: ["sql"],
      },
    },
  },
];

/**
 * Execute validated SQL and return results
 */
async function executeQuery(sql, companyId) {
  const result = validateAndPrepareQuery(sql, companyId);
  if (!result.valid) {
    return JSON.stringify({ error: result.error });
  }

  try {
    const rows = await prisma.$queryRawUnsafe(result.sql, ...(result.params || []));
    return JSON.stringify({
      success: true,
      rowCount: Array.isArray(rows) ? rows.length : 0,
      data: rows,
    });
  } catch (err) {
    console.error("Query execution error:", err.message);
    return JSON.stringify({
      error: `Query failed: ${err.message}`,
    });
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

    const schemaContext = `
${SCHEMA_DESCRIPTION}

Note: Tables with company_id are automatically filtered by the user's company. Do NOT add company_id to your SQL - the system injects it.
`;

    const messages = [
      { role: "system", content: SYSTEM_PROMPT + "\n\n" + schemaContext },
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
        max_tokens: 2048,
        temperature: 0.2,
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

          if (name === "execute_query") {
            const sql = args.sql || "";
            const result = await executeQuery(sql, companyId);
            currentMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: result,
            });
          } else {
            currentMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({ error: `Unknown tool: ${name}` }),
            });
          }
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
