const { getCompanyId } = require("../../utils/company");
const prisma = require("../../utils/prisma");

const VALID_TYPES = new Set([
  "sale_invoice",
  "quotation",
  "challan",
  "purchase_invoice",
]);

function normalizeType(t) {
  const v = String(t || "").trim().toLowerCase();
  return v;
}

const listDocumentSeries = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) return res.status(400).json({ error: "User company_id not found" });
    const companyIdNum = Number(companyId);
    if (!Number.isFinite(companyIdNum)) return res.status(400).json({ error: "Invalid company_id" });

    const type = req.query.document_type ? normalizeType(req.query.document_type) : null;
    if (type && !VALID_TYPES.has(type)) {
      return res.status(400).json({ error: "Invalid document_type" });
    }

    const rows = await prisma.document_series.findMany({
      where: {
        company_id: companyIdNum,
        ...(type ? { document_type: type } : {}),
      },
      orderBy: [{ document_type: "asc" }, { is_default: "desc" }, { prefix: "asc" }],
    });
    res.json({ data: rows });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

const createDocumentSeries = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) return res.status(400).json({ error: "User company_id not found" });
    const companyIdNum = Number(companyId);
    if (!Number.isFinite(companyIdNum)) return res.status(400).json({ error: "Invalid company_id" });

    const document_type = normalizeType(req.body.document_type);
    if (!VALID_TYPES.has(document_type)) {
      return res.status(400).json({ error: "Invalid document_type" });
    }
    const prefix = String(req.body.prefix || "").trim();
    if (!prefix) return res.status(400).json({ error: "prefix is required" });

    const next_number = req.body.next_number != null ? Number(req.body.next_number) : 1;
    if (!Number.isFinite(next_number) || next_number < 1) {
      return res.status(400).json({ error: "Invalid next_number" });
    }
    const is_default = req.body.is_default === true || req.body.is_default === "true" || req.body.is_default === 1 || req.body.is_default === "1";

    const created = await prisma.$transaction(async (tx) => {
      if (is_default) {
        await tx.document_series.updateMany({
          where: { company_id: companyIdNum, document_type },
          data: { is_default: false },
        });
      }
      return tx.document_series.create({
        data: {
          company_id: companyIdNum,
          document_type,
          prefix,
          next_number: Math.floor(next_number),
          is_default,
        },
      });
    });

    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

const setDefaultDocumentSeries = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) return res.status(400).json({ error: "User company_id not found" });
    const companyIdNum = Number(companyId);
    if (!Number.isFinite(companyIdNum)) return res.status(400).json({ error: "Invalid company_id" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    const row = await prisma.document_series.findFirst({
      where: { id, company_id: companyIdNum },
    });
    if (!row) return res.status(404).json({ error: "Series not found" });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.document_series.updateMany({
        where: { company_id: companyIdNum, document_type: row.document_type },
        data: { is_default: false },
      });
      return tx.document_series.update({
        where: { id: row.id },
        data: { is_default: true },
      });
    });

    res.json(updated);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

const deleteDocumentSeries = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) return res.status(400).json({ error: "User company_id not found" });
    const companyIdNum = Number(companyId);
    if (!Number.isFinite(companyIdNum)) return res.status(400).json({ error: "Invalid company_id" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    const row = await prisma.document_series.findFirst({
      where: { id, company_id: companyIdNum },
    });
    if (!row) return res.status(404).json({ error: "Series not found" });
    if (row.is_default) {
      return res.status(400).json({ error: "Cannot delete default series" });
    }

    await prisma.document_series.delete({ where: { id: row.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

module.exports = {
  listDocumentSeries,
  createDocumentSeries,
  setDefaultDocumentSeries,
  deleteDocumentSeries,
};

