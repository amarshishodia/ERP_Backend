const { getCompanyId } = require("../../../utils/company");
const prisma = require("../../../utils/prisma");
const cacheService = require("../../../utils/cache");
const { createTransactionWithSubAccounts } = require("../../../utils/transactionHelper");
require("dotenv").config();

// Use same PORT as server (server.js uses 5001); set PORT in .env if you run on another port (e.g. 5000)
const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || "http://localhost";

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

      // For each product (new or existing): add stock to stock table and upsert product_stock
      for (const item of resolvedBody) {
        const product = await prisma.product.findUnique({
          where: { isbn: String(item.isbn).trim() },
        });
        if (!product) continue;
        const location = await getLocationForRow(item);
        const qty = parseInt(item.quantity, 10) || 0;
        const purchasePrice = parseFloat(item.purchase_price) || 0;
        const listPrice = parseFloat(item.sale_price) || parseFloat(item.list_price) || 0;
        const reorderQty = item.reorder_quantity != null && item.reorder_quantity !== "" ? parseInt(item.reorder_quantity, 10) : null;

        if (qty > 0) {
          // Create stock table entry (per-location warehouse tracking)
          await prisma.stock.create({
            data: {
              product_id: product.id,
              company_id: companyIdNum,
              location_id: location.id,
              transaction_date: new Date(),
              purchase_price: purchasePrice,
              quantity: qty,
            },
          });
        }

        // Upsert product_stock: add quantity for existing, create for new
        const existingStock = await prisma.product_stock.findUnique({
          where: {
            product_id_company_id: {
              product_id: product.id,
              company_id: companyIdNum,
            },
          },
        });
        if (existingStock) {
          await prisma.product_stock.update({
            where: {
              product_id_company_id: {
                product_id: product.id,
                company_id: companyIdNum,
              },
            },
            data: {
              quantity: existingStock.quantity + qty,
              list_price: listPrice > 0 ? listPrice : existingStock.list_price,
              reorder_quantity: reorderQty ?? existingStock.reorder_quantity,
              location_id: location.id,
            },
          });
        } else {
          await prisma.product_stock.create({
            data: {
              product_id: product.id,
              company_id: companyIdNum,
              quantity: qty,
              list_price: listPrice > 0 ? listPrice : null,
              reorder_quantity: reorderQty,
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

      // Create product_stock entry for this company (quantity from stock entries or form)
      const purchasePrice = req.body.purchase_price && !isNaN(parseFloat(req.body.purchase_price)) ? parseFloat(req.body.purchase_price) : 0;
      const reorderQty = req.body.reorder_quantity && !isNaN(parseInt(req.body.reorder_quantity)) ? parseInt(req.body.reorder_quantity) : null;
      const productStockQty = validStockEntries.length > 0 ? totalStockQty : quantity;

      await prisma.product_stock.upsert({
        where: {
          product_id_company_id: {
            product_id: createdProduct.id,
            company_id: companyId,
          },
        },
        update: {
          quantity: productStockQty,
          reorder_quantity: reorderQty,
          list_price: salePrice > 0 ? salePrice : undefined,
          location_id: firstLocationId,
        },
        create: {
          product_id: createdProduct.id,
          company_id: companyId,
          quantity: productStockQty,
          reorder_quantity: reorderQty,
          list_price: salePrice > 0 ? salePrice : null,
          location_id: firstLocationId,
        },
      });

      // Create stock entries (multiple per product) if provided
      if (validStockEntries.length > 0) {
        const stockData = validStockEntries.map((e) => ({
          product_id: createdProduct.id,
          company_id: companyId,
          location_id: Number(e.locationId),
          transaction_date: e.transactionDate ? new Date(e.transactionDate) : new Date(),
          purchase_price: parseFloat(e.purchasePrice) || 0,
          quantity: parseInt(e.quantity, 10) || 0,
          status: e.status !== false,
        }));
        await prisma.stock.createMany({ data: stockData });
      }

      // stock product's account transaction create (only if quantity > 0 and value > 0)
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

  if (req.query.query === "all") {
    try {
      const status = req.query.status !== "false";
      const viewMode = req.query.view_mode || "stock";
      const sortBy = (req.query.sort_by || "id").toString().toLowerCase();
      const sortOrder = (req.query.sort_order || "desc").toString().toLowerCase() === "asc" ? "asc" : "desc";

      const whereCondition = { status };

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

      const allProduct = await prisma.product.findMany({
        where: whereCondition,
        orderBy,
        include: {
          product_category: { select: { name: true } },
          product_categories: {
            include: { product_category: { select: { id: true, name: true } } },
          },
          product_currency: {
            select: { id: true, name: true, symbol: true, conversion: true }
          },
          book_publisher: { select: { name: true } },
          product_stock: {
            where: { company_id: companyId },
            select: { quantity: true, reorder_quantity: true, list_price: true },
          },
        },
      });

      const productsWithImages = allProduct.map(product => {
        const stock = product.product_stock && product.product_stock.length > 0 ? product.product_stock[0] : null;
        const categories = product.product_categories?.map(pc => pc.product_category) || [];
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
  } else if (req.query.query === "search") {
    try {
      const searchTerm = req.query.prod || "";
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20; // Smaller limit for search results

      // Try to get from cache first
      const cachedData = await cacheService.getSearchResults(searchTerm, page, limit);
      
      if (cachedData) {
        console.log('Search results served from cache');
        return res.json(cachedData);
      }

      const skip = (page - 1) * limit;

      // Build search conditions (MySQL doesn't support mode: insensitive)
      const searchConditions = searchTerm ? {
        OR: [
          { name: { contains: searchTerm } },
          { isbn: { contains: searchTerm } },
          { author: { contains: searchTerm } },
          { sku: { contains: searchTerm } },
          { book_publisher: { name: { contains: searchTerm } } },
        ],
        status: true,
      } : { status: true };

      const totalCount = await prisma.product.count({
        where: searchConditions
      });

      const allProduct = await prisma.product.findMany({
        where: searchConditions,
        orderBy: { id: "desc" },
        include: {
          product_category: { select: { name: true } },
          product_categories: {
            include: { product_category: { select: { id: true, name: true } } },
          },
          product_currency: {
            select: { id: true, name: true, symbol: true, conversion: true },
          },
          book_publisher: { select: { name: true } },
          product_stock: {
            where: { company_id: companyId },
            select: { quantity: true, reorder_quantity: true, list_price: true },
          },
        },
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

      // Optimize image URL generation and add quantity from stock
      const productsWithImages = allProduct.map(product => {
        const stock = product.product_stock && product.product_stock.length > 0 ? product.product_stock[0] : null;
        const categories = product.product_categories?.map(pc => pc.product_category) || [];
        return {
          ...product,
          categories,
          quantity: stock ? stock.quantity : 0,
          reorder_quantity: stock ? stock.reorder_quantity : null,
          imageUrl: product.imageName ? `${HOST}:${PORT}/v1/product-image/${product.imageName}` : null
        };
      });

      const responseData = {
        data: productsWithImages,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1
        }
      };

      // Cache the search results
      await cacheService.setSearchResults(searchTerm, page, limit, responseData, 180); // 3 minutes cache

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
            quantity: true,
            reorder_quantity: true,
            list_price: true,
          },
        },
        stock_entries: {
          where: { company_id: companyId },
          include: {
            location: {
              select: { id: true, name: true },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!singleProduct) {
      return res.status(404).json({ error: "Product not found", id: productId });
    }

    // Check if product has stock for this company (optional check)
    if (singleProduct.product_stock.length === 0) {
      // Product exists but no stock entry - create one with 0 quantity
      await prisma.product_stock.create({
        data: {
          product_id: singleProduct.id,
          company_id: companyId,
          quantity: 0,
        },
      });
      singleProduct.product_stock = [{ quantity: 0, reorder_quantity: null }];
    }
    
    // Add quantity from stock
    singleProduct.quantity = singleProduct.product_stock[0].quantity;
    singleProduct.reorder_quantity = singleProduct.product_stock[0].reorder_quantity;
    
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
    
    // Replace stock entries only when explicitly provided (stock_entries in request)
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

      await prisma.stock.deleteMany({
        where: { product_id: productId, company_id: companyId },
      });
      if (validStockEntries.length > 0) {
        const stockData = validStockEntries.map((e) => ({
          product_id: productId,
          company_id: companyId,
          location_id: Number(e.locationId),
          transaction_date: e.transactionDate ? new Date(e.transactionDate) : new Date(),
          purchase_price: parseFloat(e.purchasePrice) || 0,
          quantity: parseInt(e.quantity, 10) || 0,
          status: e.status !== false,
        }));
        await prisma.stock.createMany({ data: stockData });
      }

      // Update product_stock from stock entries
      await prisma.product_stock.upsert({
        where: {
          product_id_company_id: {
            product_id: updatedProduct.id,
            company_id: companyId,
          },
        },
        update: {
          quantity: totalStockQty,
          reorder_quantity: reorderQuantity,
          list_price: salePrice > 0 ? salePrice : undefined,
          location_id: firstLocationId,
        },
        create: {
          product_id: updatedProduct.id,
          company_id: companyId,
          quantity: totalStockQty,
          reorder_quantity: reorderQuantity,
          list_price: salePrice > 0 ? salePrice : null,
          location_id: firstLocationId,
        },
      });
    } else {
      // Stock entries not in request - only update product_stock quantity/reorder from form (e.g. quick edit)
      await prisma.product_stock.upsert({
        where: {
          product_id_company_id: {
            product_id: updatedProduct.id,
            company_id: companyId,
          },
        },
        update: {
          quantity: quantity,
          reorder_quantity: reorderQuantity,
          list_price: salePrice > 0 ? salePrice : undefined,
        },
        create: {
          product_id: updatedProduct.id,
          company_id: companyId,
          quantity: quantity,
          reorder_quantity: reorderQuantity,
          list_price: salePrice > 0 ? salePrice : null,
        },
      });
    }

    // Add image URL if image exists
    if (updatedProduct.imageName) {
      updatedProduct.imageUrl = `${HOST}:${PORT}/v1/product-image/${updatedProduct.imageName}`;
    }
    
    // Add quantity from stock
    const stock = await prisma.product_stock.findUnique({
      where: {
        product_id_company_id: {
          product_id: updatedProduct.id,
          company_id: companyId,
        },
      },
    });
    updatedProduct.quantity = stock ? stock.quantity : 0;
    updatedProduct.reorder_quantity = stock ? stock.reorder_quantity : null;
    
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
      prisma.stock.findMany({
        where: { product_id: productId, company_id: companyId },
        include: { location: { select: { name: true } } },
        orderBy: { transaction_date: "desc" },
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
      date: row.transaction_date,
      party: row.location?.name ?? "—",
      quantity: row.quantity,
      unitPrice: row.purchase_price ?? 0,
      total: (row.quantity || 0) * (row.purchase_price || 0),
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



module.exports = {
  createSingleProduct,
  getAllProduct,
  getSingleProduct,
  updateSingleProduct,
  deleteSingleProduct,
  getProductHistory,
 
};
