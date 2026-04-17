const { getCompanyId } = require("../../../utils/company");
const prisma = require("../../../utils/prisma");
const cacheService = require("../../../utils/cache");
const { createTransactionWithSubAccounts } = require("../../../utils/transactionHelper");
require("dotenv").config();

// Use same PORT as server (server.js uses 5001); set PORT in .env if you run on another port (e.g. 5000)
const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || "http://localhost";

/**
 * Group product_stock ledger rows by location with total qty.
 * list_price is per-row; we also pass product sale_price for UI.
 */
const aggregateStocksByLocation = (productStockRows, salePrice) => {
  if (!Array.isArray(productStockRows) || productStockRows.length === 0) return [];
  const byLoc = new Map();
  for (const e of productStockRows) {
    const locId = e.location_id != null ? e.location_id : e.location?.id ?? null;
    const key = locId != null ? String(locId) : "_no_location";
    if (!byLoc.has(key)) {
      byLoc.set(key, {
        location_id: locId,
        location_name: e.location?.name ?? (locId == null ? "—" : "—"),
        quantity: 0,
        last_list_price: null,
      });
    }
    const row = byLoc.get(key);
    if (e.location?.name) row.location_name = e.location.name;
    const q = Number(e.quantity) || 0;
    row.quantity += q;
    if (e.list_price != null) row.last_list_price = Number(e.list_price);
  }
  return Array.from(byLoc.values()).map((row) => ({
    location_id: row.location_id,
    location_name: row.location_name,
    quantity: row.quantity,
    sale_price: salePrice != null ? Number(salePrice) : null,
    list_price: row.last_list_price,
  }));
};

/** Product IDs that have at least one row in `product_stock` for this company. */
const getProductIdsWithLedgerStockRows = async (companyIdNum) => {
  const byProduct = await prisma.product_stock.groupBy({
    by: ["product_id"],
    where: { company_id: companyIdNum },
    _sum: { quantity: true },
  });
  return byProduct.map((row) => row.product_id);
};

const createSingleProduct = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }

  if (req.query.query === "deletemany") {
    try {
      // delete many product at once (products are now master, but we can still delete by ID)
      const deletedProduct = await prisma.product.deleteMany({
        where: {
          id: {
            in: req.body.map((id) => Number(id)),
          },
        },
      });
      res.json(deletedProduct);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else if (req.query.query === "createmany") {
    try {
      const companyIdNum = parseInt(companyId, 10);
      // Resolve names to IDs for each row (for CSV/Excel upload with names)
      const resolvedBody = [];
      for (const item of req.body) {
        let book_publisher_id = item.book_publisher_id != null && item.book_publisher_id !== "" ? parseInt(item.book_publisher_id, 10) : null;
        let product_currency_id = item.product_currency_id != null && item.product_currency_id !== "" ? parseInt(item.product_currency_id, 10) : null;
        let product_category_id = item.product_category_id != null && item.product_category_id !== "" ? parseInt(item.product_category_id, 10) : null;
        let product_category_ids = item.product_category_ids;
        if (Array.isArray(product_category_ids)) {
          product_category_ids = product_category_ids.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id) && id > 0);
        } else if (typeof product_category_ids === "string") {
          try {
            const parsed = JSON.parse(product_category_ids);
            product_category_ids = Array.isArray(parsed) ? parsed.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id) && id > 0) : [];
          } catch {
            product_category_ids = [];
          }
        } else {
          product_category_ids = [];
        }

        if ((!book_publisher_id || isNaN(book_publisher_id)) && (item.book_publisher_name || item.book_publisher)) {
          const name = String(item.book_publisher_name || item.book_publisher).trim();
          if (name) {
            const pub = await prisma.book_publisher.findFirst({
              where: { name, company_id: companyIdNum },
            });
            if (pub) book_publisher_id = pub.id;
          }
        }
        if ((!product_currency_id || isNaN(product_currency_id)) && (item.product_currency_name || item.product_currency)) {
          const name = String(item.product_currency_name || item.product_currency).trim();
          if (name) {
            const curr = await prisma.product_currency.findFirst({
              where: { name, company_id: companyIdNum },
            });
            if (curr) product_currency_id = curr.id;
          }
        }
        if ((!product_category_id || isNaN(product_category_id)) && product_category_ids.length === 0) {
          const nameStr = item.product_category_name || item.product_category || item.category_name || item.category;
          if (nameStr) {
            const names = String(nameStr).split(",").map((s) => s.trim()).filter(Boolean);
            const ids = [];
            for (const name of names) {
              const cat = await prisma.product_category.findFirst({
                where: { name, company_id: companyIdNum },
              });
              if (cat) ids.push(cat.id);
            }
            if (ids.length === 1) product_category_id = ids[0];
            else if (ids.length > 1) product_category_ids = ids;
          }
        }

        const finalCategoryIds = product_category_ids.length > 0
          ? product_category_ids
          : (product_category_id && !isNaN(product_category_id) ? [product_category_id] : []);
        resolvedBody.push({
          ...item,
          book_publisher_id: book_publisher_id && !isNaN(book_publisher_id) ? book_publisher_id : null,
          product_currency_id: product_currency_id && !isNaN(product_currency_id) ? product_currency_id : null,
          product_category_id: product_category_id && !isNaN(product_category_id) ? product_category_id : null,
          product_category_ids: finalCategoryIds,
        });
      }

      // sum all total purchase price
      const totalPurchasePrice = resolvedBody.reduce((acc, cur) => {
        return acc + (parseFloat(cur.quantity) || 0) * (parseFloat(cur.purchase_price) || 0);
      }, 0);
      // convert incoming data to specific format (products are now master, no company_id)
      const data = resolvedBody.map((item) => {
        const productData = {
          name: item.name != null ? String(item.name).trim() : null,
          purchase_price: parseFloat(item.purchase_price) || 0,
          sale_price: parseFloat(item.sale_price) || 0,
          sku: item.sku != null ? String(item.sku).trim() : null,
          unit_measurement: parseFloat(item.unit_measurement) || null,
          unit_type: item.unit_type != null ? String(item.unit_type).trim() : null,
          isbn: item.isbn != null ? String(item.isbn).trim() : "",
          author: item.author != null ? String(item.author).trim() : null,
          product_currency_id: item.product_currency_id,
          book_publisher_id: item.book_publisher_id,
        };
        if (item.product_category_id) productData.product_category_id = item.product_category_id;
        else if (item.product_category_ids && item.product_category_ids.length > 0) productData.product_category_id = item.product_category_ids[0];
        return productData;
      }).filter((p) => p.isbn && (p.book_publisher_id || p.product_currency_id)); // skip invalid rows

      // Create products (skip duplicates by ISBN) - only new products get created
      const createdProduct = await prisma.product.createMany({
        data: data,
        skipDuplicates: true,
      });

      // Helper to get or create location for this company
      const getLocationForRow = async (item) => {
        const locationName = item.location_name ? String(item.location_name).trim() : null;
        if (locationName) {
          const loc = await prisma.location.findFirst({
            where: { name: locationName, company_id: companyIdNum },
          });
          if (loc) return loc;
          return prisma.location.create({
            data: { name: locationName, company_id: companyIdNum },
          });
        }
        let defaultLocation = await prisma.location.findFirst({
          where: { company_id: companyIdNum },
        });
        if (!defaultLocation) {
          defaultLocation = await prisma.location.create({
            data: { name: "Default", company_id: companyIdNum },
          });
        }
        return defaultLocation;
      };

      // After creating products, add categories if provided
      for (const item of resolvedBody) {
        const product = await prisma.product.findUnique({
          where: { isbn: String(item.isbn).trim() },
        });
        if (!product) continue;
        if (item.product_category_ids && Array.isArray(item.product_category_ids) && item.product_category_ids.length > 0) {
          const categoryIds = item.product_category_ids
            .map((id) => Number(id))
            .filter((id) => !isNaN(id) && id > 0);
          if (categoryIds.length > 0) {
            await prisma.product_product_category.createMany({
              data: categoryIds.map((categoryId) => ({
                product_id: product.id,
                product_category_id: categoryId,
              })),
              skipDuplicates: true,
            });
          }
        } else if (item.product_category_id) {
          const categoryId = Number(item.product_category_id);
          if (!isNaN(categoryId) && categoryId > 0) {
            await prisma.product_product_category.create({
              data: {
                product_id: product.id,
                product_category_id: categoryId,
              },
            }).catch(() => {});
          }
        }
      }

      // For each product (new or existing): add opening stock rows into product_stock
      for (const item of resolvedBody) {
        const product = await prisma.product.findUnique({
          where: { isbn: String(item.isbn).trim() },
        });
        if (!product) continue;
        const location = await getLocationForRow(item);
        const qty = parseInt(item.quantity, 10) || 0;
        const listPrice = parseFloat(item.sale_price) || parseFloat(item.list_price) || 0;
        const reorderQty = item.reorder_quantity != null && item.reorder_quantity !== "" ? parseInt(item.reorder_quantity, 10) : null;

        if (qty > 0) {
          await prisma.product_stock.create({
            data: {
              product_id: product.id,
              company_id: companyIdNum,
              quantity: qty,
              transactionDate: new Date(),
              reorder_quantity: reorderQty,
              list_price: listPrice > 0 ? listPrice : null,
              location_id: location.id,
            },
          });
        }
      }
      // stock product's account transaction create with company_id
      await prisma.transaction.create({
        data: {
          date: new Date(),
          debit: { connect: { id: 3 } },
          credit: { connect: { id: 6 } },
          amount: totalPurchasePrice,
          particulars: `Initial stock of ${createdProduct.count} item/s of product`,
          company: {
            connect: { id: companyId },
          },
        },
      });
      res.json(createdProduct);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else {
    try {
      // create one product from an object

      // Check if ISBN is already taken (ISBN is now globally unique)
      const existingProduct = await prisma.product.findUnique({
        where: {
          isbn: req.body.isbn,
        },
      });

      if (existingProduct) {
        return res.status(400).json({ message: 'ISBN is already taken.' });
      }

      const file = req.file;

      // Get quantity for product and product_stock (DB has NOT NULL on product.quantity)
      const quantity = req.body.quantity != null && req.body.quantity !== '' && !isNaN(parseInt(req.body.quantity))
        ? parseInt(req.body.quantity, 10)
        : 0;

      // Prepare data object with proper handling of optional fields
      const productData = {
        isbn: req.body.isbn,
        name: req.body.name,
        author: req.body.author || null,
        quantity,
        book_publisher_id: req.body.book_publisher_id ? Number(req.body.book_publisher_id) : null,
        product_currency_id: req.body.product_currency_id ? Number(req.body.product_currency_id) : null,
        purchase_price: req.body.purchase_price ? parseFloat(req.body.purchase_price) : 0,
        sale_price: parseFloat(req.body.sale_price),
        imageName: file?.filename || '',
        unit_type: req.body.unit_type,
      };

      // Handle single category (backward compatibility) or multiple categories
      let categoryIds = [];
      if (req.body.product_category_ids) {
        // Try to parse as JSON string first, then as array
        let parsedIds = req.body.product_category_ids;
        if (typeof parsedIds === 'string') {
          try {
            parsedIds = JSON.parse(parsedIds);
          } catch (e) {
            // If not JSON, treat as single value
            parsedIds = [parsedIds];
          }
        }
        if (Array.isArray(parsedIds)) {
          categoryIds = parsedIds
            .map(id => Number(id))
            .filter(id => !isNaN(id) && id > 0);
        } else if (!isNaN(Number(parsedIds))) {
          categoryIds = [Number(parsedIds)].filter(id => id > 0);
        }
      } else if (req.body.product_category_id && !isNaN(Number(req.body.product_category_id))) {
        // Single category (backward compatibility)
        const singleCategoryId = Number(req.body.product_category_id);
        if (singleCategoryId > 0) {
          categoryIds = [singleCategoryId];
          productData.product_category_id = singleCategoryId; // Keep for backward compatibility
        }
      }

      if (req.body.unit_measurement && !isNaN(parseFloat(req.body.unit_measurement))) {
        productData.unit_measurement = parseFloat(req.body.unit_measurement);
      }

      // Create product with categories
      const createdProduct = await prisma.product.create({
        data: {
          ...productData,
          product_categories: categoryIds.length > 0 ? {
            create: categoryIds.map(categoryId => ({
              product_category_id: categoryId
            }))
          } : undefined
        },
        include: {
          product_categories: {
            include: {
              product_category: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });
      file?.filename?
      createdProduct.imageUrl = `${HOST}:${PORT}/v1/product-image/${file.filename}`:'';

      // Parse stock entries first (used for product_stock and transaction)
      let stockEntries = [];
      if (req.body.stock_entries) {
        try {
          const parsed = typeof req.body.stock_entries === 'string'
            ? JSON.parse(req.body.stock_entries)
            : req.body.stock_entries;
          stockEntries = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          console.log('Failed to parse stock_entries:', e.message);
        }
      }
      const validStockEntries = stockEntries.filter(
        (e) =>
          e.locationId != null &&
          e.quantity != null &&
          !isNaN(Number(e.quantity)) &&
          Number(e.quantity) >= 0
      );
      const totalStockQty = validStockEntries.reduce((sum, e) => sum + (parseInt(e.quantity, 10) || 0), 0);
      const totalStockValue = validStockEntries.reduce(
        (sum, e) => sum + (parseInt(e.quantity, 10) || 0) * (parseFloat(e.purchasePrice) || 0),
        0
      );
      const firstLocationId = validStockEntries.length > 0 ? Number(validStockEntries[0].locationId) : null;
      const salePrice = parseFloat(req.body.sale_price) || 0;

      const reorderQty = req.body.reorder_quantity && !isNaN(parseInt(req.body.reorder_quantity)) ? parseInt(req.body.reorder_quantity) : null;
      // Create product_stock ledger rows (multiple per product) if provided.
      // If none provided, create a single row from the form quantity (if > 0).
      const stockLedgerRows =
        validStockEntries.length > 0
          ? validStockEntries.map((e) => ({
              product_id: createdProduct.id,
              company_id: companyId,
              location_id: Number(e.locationId),
              transactionDate: e.transactionDate ? new Date(e.transactionDate) : new Date(),
              quantity: parseInt(e.quantity, 10) || 0,
              reorder_quantity: reorderQty,
              list_price: salePrice > 0 ? salePrice : null,
            }))
          : (quantity > 0
              ? [{
                  product_id: createdProduct.id,
                  company_id: companyId,
                  location_id: firstLocationId,
                  transactionDate: new Date(),
                  quantity,
                  reorder_quantity: reorderQty,
                  list_price: salePrice > 0 ? salePrice : null,
                }]
              : []);

      if (stockLedgerRows.length > 0) {
        await prisma.product_stock.createMany({ data: stockLedgerRows });
      }

      // stock product's account transaction create (only if quantity > 0 and value > 0)
      const purchasePrice = req.body.purchase_price && !isNaN(parseFloat(req.body.purchase_price)) ? parseFloat(req.body.purchase_price) : 0;
      const transactionAmount = validStockEntries.length > 0 ? totalStockValue : purchasePrice * quantity;
      if (transactionAmount > 0) {
        await createTransactionWithSubAccounts({
          date: new Date(),
          sub_debit_id: 3, // Inventory
          sub_credit_id: 6, // Capital
          amount: transactionAmount,
          particulars: `Initial stock of product #${createdProduct.id}`,
          company_id: companyId,
        });
      }

      // Invalidate product cache when new product is created
      await cacheService.invalidateProductCache();

      res.json(createdProduct);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  }
};

const getAllProduct = async (req, res) => {
  // Get company_id from logged-in user
  const companyId = await getCompanyId(req.auth.sub);
  if (!companyId) {
    return res.status(400).json({ error: "User company_id not found" });
  }
  const companyIdNum = Number(companyId);
  if (!Number.isFinite(companyIdNum)) {
    return res.status(400).json({ error: "Invalid company_id" });
  }

  if (req.query.query === "all") {
    try {
      const status = req.query.status !== "false";
      const viewMode = req.query.view_mode || "stock";
      const sortBy = (req.query.sort_by || "id").toString().toLowerCase();
      const sortOrder = (req.query.sort_order || "desc").toString().toLowerCase() === "asc" ? "asc" : "desc";

      const whereCondition = { status };

      // Product list "My Stock": products with any `product_stock` ledger row for this company
      const onlyLedgerStock =
        req.query.only_ledger_stock === "true" || req.query.only_ledger_stock === "1";
      if (onlyLedgerStock) {
        const inStockProductIds = await getProductIdsWithLedgerStockRows(companyIdNum);
        if (inStockProductIds.length === 0) {
          return res.json({ data: [] });
        }
        whereCondition.id = { in: inStockProductIds };
      }

      let orderBy = { id: "desc" };
      if (sortBy === "name" || sortBy === "title") {
        orderBy = { name: sortOrder };
      } else if (sortBy === "author") {
        orderBy = { author: sortOrder };
      } else if (sortBy === "sale_price" || sortBy === "price") {
        orderBy = { sale_price: sortOrder };
      } else if (sortBy === "publisher") {
        orderBy = { book_publisher: { name: sortOrder } };
      }

      const includeBase = {
        product_category: { select: { name: true } },
        product_categories: {
          include: { product_category: { select: { id: true, name: true } } },
        },
        product_currency: {
          select: { id: true, name: true, symbol: true, conversion: true },
        },
        book_publisher: { select: { name: true } },
        product_stock: {
          where: { company_id: companyIdNum },
          select: {
            id: true,
            quantity: true,
            reorder_quantity: true,
            list_price: true,
            transactionDate: true,
            location_id: true,
            location: { select: { id: true, name: true } },
          },
          orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
        },
      };

      const allProduct = await prisma.product.findMany({
        where: whereCondition,
        orderBy,
        include: includeBase,
      });

      let productsWithImages = allProduct.map((product) => {
        const categories = product.product_categories?.map((pc) => pc.product_category) || [];
        const psRows = product.product_stock || [];
        const stocksByLocation = aggregateStocksByLocation(psRows, product.sale_price);
        const quantity = psRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
        const reorder_quantity =
          psRows.length > 0 ? (psRows.find((r) => r.reorder_quantity != null)?.reorder_quantity ?? null) : null;
        const { ...rest } = product;
        return {
          ...rest,
          categories,
          quantity,
          reorder_quantity,
          stocks_by_location:
            viewMode === "stock" || onlyLedgerStock ? stocksByLocation : undefined,
          imageUrl: product.imageName ? `${HOST}:${PORT}/v1/product-image/${product.imageName}` : null,
        };
      });

      // Drop rows with no ledger-derived locations (should not happen if id filter matches stock table)
      if (onlyLedgerStock) {
        productsWithImages = productsWithImages.filter((p) => {
          const rows = p.stocks_by_location || [];
          return rows.length > 0;
        });
      }

      res.json({ data: productsWithImages });
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else if (req.query.query === "search") {
    try {
      const searchTerm = req.query.prod || "";
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20; // Smaller limit for search results
      const searchOnlyLedger =
        req.query.only_ledger_stock === "true" || req.query.only_ledger_stock === "1";

      // Try to get from cache first
      const cachedData = await cacheService.getSearchResults(searchTerm, page, limit, searchOnlyLedger);

      if (cachedData) {
        console.log("Search results served from cache");
        return res.json(cachedData);
      }

      const skip = (page - 1) * limit;

      // Build search conditions (MySQL doesn't support mode: insensitive)
      const searchConditions = searchTerm
        ? {
            OR: [
              { name: { contains: searchTerm } },
              { isbn: { contains: searchTerm } },
              { author: { contains: searchTerm } },
              { sku: { contains: searchTerm } },
              { book_publisher: { name: { contains: searchTerm } } },
            ],
            status: true,
          }
        : { status: true };

      let whereForSearch = searchConditions;
      if (searchOnlyLedger) {
        const ledgerIds = await getProductIdsWithLedgerStockRows(companyIdNum);
        if (ledgerIds.length === 0) {
          const emptyResp = {
            data: [],
            pagination: {
              currentPage: page,
              totalPages: 0,
              totalItems: 0,
              itemsPerPage: limit,
              hasNextPage: false,
              hasPrevPage: page > 1,
            },
          };
          await cacheService.setSearchResults(searchTerm, page, limit, emptyResp, 180, searchOnlyLedger);
          return res.json(emptyResp);
        }
        whereForSearch = { AND: [searchConditions, { id: { in: ledgerIds } }] };
      }

      const totalCount = await prisma.product.count({
        where: whereForSearch,
      });

      const searchInclude = {
        product_category: { select: { name: true } },
        product_categories: {
          include: { product_category: { select: { id: true, name: true } } },
        },
        product_currency: {
          select: { id: true, name: true, symbol: true, conversion: true },
        },
        book_publisher: { select: { name: true } },
        product_stock: {
          where: { company_id: companyIdNum },
          select: {
            id: true,
            quantity: true,
            reorder_quantity: true,
            list_price: true,
            transactionDate: true,
            location_id: true,
            location: { select: { id: true, name: true } },
          },
          orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
        },
      };

      const allProduct = await prisma.product.findMany({
        where: whereForSearch,
        orderBy: { id: "desc" },
        include: searchInclude,
        skip: skip,
        take: limit,
      });

      // Sort by relevance if searching
      if (searchTerm) {
        allProduct.sort((a, b) => {
          const searchLower = searchTerm.toLowerCase();
          
          // Calculate relevance score for each product
          const getRelevanceScore = (product) => {
            let score = 0;
            const name = (product.name || '').toLowerCase();
            const isbn = (product.isbn || '').toLowerCase();
            const author = (product.author || '').toLowerCase();
            const publisher = (product.book_publisher?.name || '').toLowerCase();
            const sku = (product.sku || '').toLowerCase();
            
            // Exact matches get highest score
            if (name === searchLower) score += 100;
            if (isbn === searchLower) score += 100;
            if (author === searchLower) score += 100;
            if (publisher === searchLower) score += 100;
            if (sku === searchLower) score += 100;
            
            // Starts with gets high score
            if (name.startsWith(searchLower)) score += 50;
            if (isbn.startsWith(searchLower)) score += 50;
            if (author.startsWith(searchLower)) score += 50;
            if (publisher.startsWith(searchLower)) score += 50;
            if (sku.startsWith(searchLower)) score += 50;
            
            // Contains gets medium score
            if (name.includes(searchLower)) score += 20;
            if (isbn.includes(searchLower)) score += 20;
            if (author.includes(searchLower)) score += 20;
            if (publisher.includes(searchLower)) score += 20;
            if (sku.includes(searchLower)) score += 20;
            
            return score;
          };
          
          const scoreA = getRelevanceScore(a);
          const scoreB = getRelevanceScore(b);
          
          // Sort by relevance score (descending), then by ID (descending)
          if (scoreA !== scoreB) {
            return scoreB - scoreA;
          }
          return b.id - a.id;
        });
      }

      // Optimize image URL generation and add quantity from stock / ledger
      let productsWithImages = allProduct.map((product) => {
        const categories = product.product_categories?.map((pc) => pc.product_category) || [];
        const psRows = product.product_stock || [];
        const stocksByLocation = searchOnlyLedger ? aggregateStocksByLocation(psRows, product.sale_price) : [];
        const quantity = psRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
        const reorder_quantity =
          psRows.length > 0 ? (psRows.find((r) => r.reorder_quantity != null)?.reorder_quantity ?? null) : null;
        const { ...rest } = product;
        const row = {
          ...rest,
          categories,
          quantity,
          reorder_quantity,
          imageUrl: product.imageName ? `${HOST}:${PORT}/v1/product-image/${product.imageName}` : null,
        };
        if (searchOnlyLedger) {
          row.stocks_by_location = stocksByLocation;
        }
        return row;
      });

      if (searchOnlyLedger) {
        productsWithImages = productsWithImages.filter((p) => {
          const rows = p.stocks_by_location || [];
          return rows.length > 0;
        });
      }

      const responseData = {
        data: productsWithImages,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1,
        },
      };

      // Cache the search results
      await cacheService.setSearchResults(searchTerm, page, limit, responseData, 180, searchOnlyLedger); // 3 minutes cache

      res.json(responseData);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else if (req.query.query === "info") {
    // Get products with stock for this company
    const productStocks = await prisma.product_stock.findMany({
      where: { company_id: companyId },
      include: {
        product: true,
      },
    });
    
    // Filter to only include products with status: true
    const productsWithStock = productStocks.filter(ps => ps.product && ps.product.status === true);
    const totalCount = await prisma.product.count({ where: { status: true } });
    const totalQuantity = productsWithStock.reduce((sum, ps) => sum + ps.quantity, 0);
    
    const totalPurchasePrice = productsWithStock.reduce((acc, ps) => {
      return acc + (ps.quantity * (ps.product.purchase_price || 0));
    }, 0);
    const totalSalePrice = productsWithStock.reduce((acc, ps) => {
      return acc + (ps.quantity * (ps.product.sale_price || 0));
    }, 0);
    
    res.json({ 
      _count: { id: totalCount },
      _sum: { quantity: totalQuantity },
      totalPurchasePrice, 
      totalSalePrice 
    });
  } else if (req.query.status === "false") {
    try {
      const allProduct = await prisma.product.findMany({
        orderBy: { id: "desc" },
        where: { status: false },
        include: {
          product_category: { select: { name: true } },
          product_currency: {
            select: { id: true, name: true, symbol: true, conversion: true },
          },
          book_publisher: { select: { name: true } },
          product_stock: {
            where: { company_id: companyId },
            select: { quantity: true, reorder_quantity: true, list_price: true },
          },
        },
      });
      // attach signed url to each product and add quantity from stock
      for (let product of allProduct) {
        if (product.imageName) {
          product.imageUrl = `${HOST}:${PORT}/v1/product-image/${product.imageName}`;
        }
        product.quantity = product.product_stock && product.product_stock.length > 0 ? product.product_stock[0].quantity : 0;
        product.reorder_quantity = product.product_stock && product.product_stock.length > 0 ? product.product_stock[0].reorder_quantity : null;
      }
      res.json(allProduct);
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  } else {
    // Default endpoint - return all products with status true (no pagination)
    try {
      const allProduct = await prisma.product.findMany({
        orderBy: { id: "desc" },
        where: { status: true },
        include: {
          product_category: { select: { name: true } },
          product_categories: {
            include: { product_category: { select: { id: true, name: true } } },
          },
          book_publisher: { select: { name: true } },
          product_currency: {
            select: { id: true, name: true, symbol: true, conversion: true },
          },
          product_stock: {
            where: { company_id: companyId },
            select: { quantity: true, reorder_quantity: true, list_price: true },
          },
        },
      });

      const productsWithImages = allProduct.map(product => {
        const categories = product.product_categories?.map(pc => pc.product_category) || [];
        const stock = product.product_stock && product.product_stock.length > 0 ? product.product_stock[0] : null;
        return {
          ...product,
          categories,
          quantity: stock ? stock.quantity : 0,
          reorder_quantity: stock ? stock.reorder_quantity : null,
          imageUrl: product.imageName ? `${HOST}:${PORT}/v1/product-image/${product.imageName}` : null
        };
      });

      res.json({ data: productsWithImages });
    } catch (error) {
      res.status(400).json(error.message);
      console.log(error.message);
    }
  }
};

const getSingleProduct = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const productId = Number(req.params.id);
    const singleProduct = await prisma.product.findUnique({
      where: {
        id: productId,
      },
      select: {
        id: true,
        name: true,
        isbn: true,
        author: true,
        purchase_price: true,
        sale_price: true,
        imageName: true,
        unit_measurement: true,
        unit_type: true,
        sku: true,
        status: true,
        created_at: true,
        updated_at: true,
        product_category_id: true,
        product_currency_id: true,
        book_publisher_id: true,
        product_category: {
          select: {
            id: true,
            name: true,
          },
        },
        product_currency: {
          select: {
            id: true,
            name: true,
            symbol: true,
          },
        },
        book_publisher: {
          select: {
            id: true,
            name: true,
          },
        },
        product_categories: {
          include: {
            product_category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        product_stock: {
          where: { company_id: companyId },
          select: {
            id: true,
            quantity: true,
            reorder_quantity: true,
            list_price: true,
            transactionDate: true,
            location_id: true,
            location: { select: { id: true, name: true } },
          },
          orderBy: { transactionDate: "asc" },
        },
      },
    });

    if (!singleProduct) {
      return res.status(404).json({ error: "Product not found", id: productId });
    }

    // Add quantity from product_stock ledger
    const psRows = singleProduct.product_stock || [];
    singleProduct.quantity = psRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    singleProduct.reorder_quantity =
      psRows.length > 0 ? (psRows.find((r) => r.reorder_quantity != null)?.reorder_quantity ?? null) : null;

    singleProduct.stocks_by_location = aggregateStocksByLocation(psRows, singleProduct.sale_price);
    
    // Add categories array
    singleProduct.categories = singleProduct.product_categories?.map(pc => pc.product_category) || [];

    if (singleProduct && singleProduct.imageName) {
      singleProduct.imageUrl = `${HOST}:${PORT}/v1/product-image/${singleProduct.imageName}`;
    }
    res.json(singleProduct);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const updateSingleProduct = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // Verify that the product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id: Number(req.params.id) },
    });

    if (!existingProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    const file = req.file;
    
    const updateData = {
      name: req.body.name,
      author: req.body.author,
      book_publisher_id: Number(req.body.book_publisher_id),
      product_currency_id: Number(req.body.product_currency_id),
      purchase_price: parseFloat(req.body.purchase_price),
      sale_price: parseFloat(req.body.sale_price),
      unit_measurement: parseFloat(req.body.unit_measurement),
      unit_type: req.body.unit_type,
    };
    
    // Handle single category (backward compatibility) or multiple categories
    let categoryIds = [];
    if (req.body.product_category_ids) {
      // Try to parse as JSON string first, then as array
      let parsedIds = req.body.product_category_ids;
      if (typeof parsedIds === 'string') {
        try {
          parsedIds = JSON.parse(parsedIds);
        } catch (e) {
          // If not JSON, treat as single value
          parsedIds = [parsedIds];
        }
      }
      if (Array.isArray(parsedIds)) {
        categoryIds = parsedIds
          .map(id => Number(id))
          .filter(id => !isNaN(id) && id > 0);
      } else if (!isNaN(Number(parsedIds))) {
        categoryIds = [Number(parsedIds)].filter(id => id > 0);
      }
    } else if (req.body.product_category_id && !isNaN(Number(req.body.product_category_id))) {
      // Single category (backward compatibility)
      const singleCategoryId = Number(req.body.product_category_id);
      if (singleCategoryId > 0) {
        categoryIds = [singleCategoryId];
        updateData.product_category_id = singleCategoryId; // Keep for backward compatibility
      }
    }
    
    // Handle quantity and reorder_quantity in product_stock
    const quantity = parseInt(req.body.quantity) || 0;
    const reorderQuantity = req.body.reorder_quantity ? parseInt(req.body.reorder_quantity) : null;

    // Only update image if a new file is provided
    if (file?.filename) {
      updateData.imageName = file.filename;
    }

    // Update product categories
    if (categoryIds.length > 0) {
      // Set primary category (first selected) so product shows in category detail "Products under X"
      updateData.product_category_id = categoryIds[0];
      // Delete existing categories and create new ones
      await prisma.product_product_category.deleteMany({
        where: { product_id: Number(req.params.id) }
      });
      updateData.product_categories = {
        create: categoryIds.map(categoryId => ({
          product_category_id: categoryId
        }))
      };
    } else {
      // If no categories provided, clear primary category and delete all junction records
      updateData.product_category_id = null;
      await prisma.product_product_category.deleteMany({
        where: { product_id: Number(req.params.id) }
      });
    }

    const updatedProduct = await prisma.product.update({
      where: {
        id: Number(req.params.id),
      },
      data: updateData,
      include: {
        product_category: {
          select: {
            id: true,
            name: true,
          },
        },
        product_categories: {
          include: {
            product_category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
    
    // Replace product_stock ledger entries only when explicitly provided (stock_entries in request)
    let stockEntries = [];
    const hasStockEntriesInRequest = req.body.stock_entries !== undefined && req.body.stock_entries !== null;
    if (hasStockEntriesInRequest) {
      try {
        const parsed = typeof req.body.stock_entries === 'string'
          ? JSON.parse(req.body.stock_entries)
          : req.body.stock_entries;
        stockEntries = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.log('Failed to parse stock_entries:', e.message);
      }
    }

    const productId = Number(req.params.id);
    const salePrice = parseFloat(req.body.sale_price) || 0;

    if (hasStockEntriesInRequest) {
      const validStockEntries = stockEntries.filter(
        (e) =>
          e.locationId != null &&
          e.quantity != null &&
          !isNaN(Number(e.quantity)) &&
          Number(e.quantity) >= 0
      );
      const totalStockQty = validStockEntries.reduce((sum, e) => sum + (parseInt(e.quantity, 10) || 0), 0);
      const firstLocationId = validStockEntries.length > 0 ? Number(validStockEntries[0].locationId) : null;

      // Replace all ledger rows for this product/company
      await prisma.product_stock.deleteMany({
        where: { product_id: productId, company_id: companyId },
      });

      if (validStockEntries.length > 0) {
        const stockData = validStockEntries.map((e) => ({
          product_id: productId,
          company_id: companyId,
          location_id: Number(e.locationId),
          transactionDate: e.transactionDate ? new Date(e.transactionDate) : new Date(),
          quantity: parseInt(e.quantity, 10) || 0,
          reorder_quantity: reorderQuantity,
          list_price: salePrice > 0 ? salePrice : null,
        }));
        await prisma.product_stock.createMany({ data: stockData });
      } else if (quantity > 0) {
        await prisma.product_stock.create({
          data: {
            product_id: productId,
            company_id: companyId,
            location_id: firstLocationId,
            transactionDate: new Date(),
            quantity,
            reorder_quantity: reorderQuantity,
            list_price: salePrice > 0 ? salePrice : null,
          },
        });
      }
    } else {
      // Stock entries not in request - keep ledger rows, but update reorder/list_price on existing rows
      await prisma.product_stock.updateMany({
        where: { product_id: updatedProduct.id, company_id: companyId },
        data: {
          reorder_quantity: reorderQuantity,
          list_price: salePrice > 0 ? salePrice : undefined,
        },
      });
    }

    // Add image URL if image exists
    if (updatedProduct.imageName) {
      updatedProduct.imageUrl = `${HOST}:${PORT}/v1/product-image/${updatedProduct.imageName}`;
    }
    
    // Add quantity from product_stock ledger
    const rows = await prisma.product_stock.findMany({
      where: { product_id: updatedProduct.id, company_id: companyId },
      select: { quantity: true, reorder_quantity: true },
    });
    updatedProduct.quantity = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    updatedProduct.reorder_quantity =
      rows.length > 0 ? (rows.find((r) => r.reorder_quantity != null)?.reorder_quantity ?? null) : null;
    
    // Add categories array
    updatedProduct.categories = updatedProduct.product_categories?.map(pc => pc.product_category) || [];

    // Invalidate product cache when product is updated
    await cacheService.invalidateProductCache();

    res.json(updatedProduct);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const deleteSingleProduct = async (req, res) => {
  try {
    // Get company_id from logged-in user
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    // Verify that the product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id: Number(req.params.id) },
    });

    if (!existingProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    const deletedProduct = await prisma.product.update({
      where: {
        id: Number(req.params.id),
      },
      data: {
        status: req.body.status,
      },
    });
    // TODO: implement delete image from disk
    // if (deletedProduct && deletedProduct.imageName) {
    //   await deleteFile(deletedProduct.imageName);
    // }

    // Invalidate product cache when product status is changed
    await cacheService.invalidateProductCache();

    res.json(deletedProduct);
  } catch (error) {
    res.status(400).json(error.message);
    console.log(error.message);
  }
};

const getProductHistory = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }
    const productId = Number(req.query.product_id);
    if (!productId || isNaN(productId)) {
      return res.status(400).json({ error: "product_id is required" });
    }

    const [purchaseHistory, saleHistory, openingStockRows] = await Promise.all([
      prisma.product_purchase_history.findMany({
        where: { product_id: productId, company_id: companyId },
        include: {
          supplier: { select: { name: true } },
          purchaseInvoice: { select: { id: true, date: true } },
        },
        orderBy: { purchase_date: "desc" },
      }),
      prisma.product_sale_history.findMany({
        where: { product_id: productId, company_id: companyId },
        include: {
          customer: { select: { name: true } },
          saleInvoice: { select: { id: true, date: true, prefix: true, invoice_number: true } },
        },
        orderBy: { sale_date: "desc" },
      }),
      prisma.product_stock.findMany({
        where: { product_id: productId, company_id: companyId },
        include: { location: { select: { name: true } } },
        orderBy: { transactionDate: "desc" },
      }),
    ]);

    const formatPurchase = (row) => ({
      type: "Purchase",
      date: row.purchase_date,
      party: row.supplier?.name ?? "—",
      quantity: row.quantity,
      unitPrice: row.purchase_price,
      total: row.total_amount,
      discount: row.discount ?? 0,
      invoiceId: row.purchase_invoice_id,
      invoiceRef: row.purchaseInvoice ? `PI#${row.purchaseInvoice.id}` : "—",
    });
    const formatSale = (row) => ({
      type: "Sale",
      date: row.sale_date,
      party: row.customer?.name ?? "—",
      quantity: row.quantity,
      unitPrice: row.sale_price,
      total: row.total_amount,
      discount: row.discount ?? 0,
      profit: row.profit ?? null,
      invoiceId: row.sale_invoice_id,
      invoiceRef: row.saleInvoice
        ? `${row.saleInvoice.prefix || ""}${row.saleInvoice.invoice_number}`
        : "—",
    });

    const formatOpeningStock = (row) => ({
      type: "Opening Stock",
      date: row.transactionDate,
      party: row.location?.name ?? "—",
      quantity: row.quantity,
      unitPrice: row.list_price ?? 0,
      total: (row.quantity || 0) * (row.list_price || 0),
      discount: 0,
      invoiceId: null,
      invoiceRef: "—",
    });

    res.json({
      purchaseHistory: purchaseHistory.map(formatPurchase),
      saleHistory: saleHistory.map(formatSale),
      openingStock: (openingStockRows || []).map(formatOpeningStock),
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
    console.error(error);
  }
};



/**
 * PATCH .../product/:id/sync-list-price — update product.sale_price + company product_stock.list_price only.
 */
const patchProductListPriceSync = async (req, res) => {
  try {
    const companyId = await getCompanyId(req.auth.sub);
    if (!companyId) {
      return res.status(400).json({ error: "User company_id not found" });
    }

    const productId = Number(req.params.id);
    const listPrice = parseFloat(req.body.list_price);
    if (!Number.isFinite(listPrice) || listPrice < 0) {
      return res.status(400).json({ error: "Invalid list_price" });
    }

    const existing = await prisma.product.findUnique({ where: { id: productId } });
    if (!existing) {
      return res.status(404).json({ error: "Product not found" });
    }

    await prisma.product.update({
      where: { id: productId },
      data: { sale_price: listPrice },
    });

    // Update list_price on all existing ledger rows; if none exist, create a zero-qty row.
    const updated = await prisma.product_stock.updateMany({
      where: { product_id: productId, company_id: companyId },
      data: { list_price: listPrice },
    });
    if (!updated || updated.count === 0) {
      await prisma.product_stock.create({
        data: {
          product_id: productId,
          company_id: companyId,
          quantity: 0,
          transactionDate: new Date(),
          list_price: listPrice,
        },
      });
    }

    res.json({ ok: true, product_id: productId, list_price: listPrice });
  } catch (error) {
    res.status(400).json({ message: error.message });
    console.log(error.message);
  }
};

/**
 * PATCH .../product/:id/sync-purchase-price — update product.purchase_price only (cost on master).
 */
const patchProductPurchasePriceSync = async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const purchasePrice = parseFloat(req.body.purchase_price);
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      return res.status(400).json({ error: "Invalid purchase_price" });
    }

    const existing = await prisma.product.findUnique({ where: { id: productId } });
    if (!existing) {
      return res.status(404).json({ error: "Product not found" });
    }

    await prisma.product.update({
      where: { id: productId },
      data: { purchase_price: purchasePrice },
    });

    res.json({ ok: true, product_id: productId, purchase_price: purchasePrice });
  } catch (error) {
    res.status(400).json({ message: error.message });
    console.log(error.message);
  }
};

module.exports = {
  createSingleProduct,
  getAllProduct,
  getSingleProduct,
  updateSingleProduct,
  deleteSingleProduct,
  getProductHistory,
  patchProductListPriceSync,
  patchProductPurchasePriceSync,
};
