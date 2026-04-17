const prisma = require("./prisma");

/**
 * Atomically allocate next number for a document series.
 * Returns { series, prefix, invoice_number }.
 */
async function allocateDocumentNumber({ company_id, document_type, series_id, requested_number }) {
  const companyIdNum = Number(company_id);
  if (!Number.isFinite(companyIdNum)) throw new Error("Invalid company_id");

  const docType = String(document_type || "").trim().toLowerCase();
  if (!docType) throw new Error("document_type is required");

  return prisma.$transaction(async (tx) => {
    let series = null;
    if (series_id != null) {
      const idNum = Number(series_id);
      if (!Number.isFinite(idNum)) throw new Error("Invalid series_id");
      series = await tx.document_series.findFirst({
        where: { id: idNum, company_id: companyIdNum, document_type: docType },
      });
      if (!series) throw new Error("Series not found");
    } else {
      series = await tx.document_series.findFirst({
        where: { company_id: companyIdNum, document_type: docType, is_default: true },
        orderBy: { id: "asc" },
      });
      if (!series) {
        series = await tx.document_series.findFirst({
          where: { company_id: companyIdNum, document_type: docType },
          orderBy: { id: "asc" },
        });
      }
      if (!series) throw new Error(`No series configured for ${docType}`);
    }

    const reqNum =
      requested_number != null && requested_number !== ""
        ? Number(requested_number)
        : NaN;
    const hasRequested = Number.isFinite(reqNum) && reqNum >= 1;

    const invoice_number = hasRequested ? Math.floor(reqNum) : Number(series.next_number || 1);
    const next_number = Math.max(Number(series.next_number || 1), invoice_number + 1);
    await tx.document_series.update({
      where: { id: series.id },
      data: { next_number },
    });

    return {
      series,
      prefix: series.prefix,
      invoice_number,
    };
  });
}

module.exports = {
  allocateDocumentNumber,
};

