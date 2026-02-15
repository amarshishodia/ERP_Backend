const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const prisma = require("../../../utils/prisma");
const cacheService = require("../../../utils/cache");
const { createTransactionWithSubAccounts } = require("../../../utils/transactionHelper");
require("dotenv").config();

const PORT = process.env.PORT || 2029;
const HOST = process.env.HOST;

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
      // sum all total purchase price
      const totalPurchasePrice = req.body.reduce((acc, cur) => {
        return acc + cur.quantity * cur.purchase_price;
      }, 0);
      // convert incoming data to specific format (products are now master, no company_id)
      const data = req.body.map((item) => {
        const productData = {
          name: item.name,
          purchase_price: parseFloat(item.purchase_price),
          sale_price: parseFloat(item.sale_price),
          sku: item.sku,
          unit_measurement: parseFloat(item.unit_measurement),
          unit_type: item.unit_type,
          isbn: item.isbn,
          author: item.author,
          product_currency_id: parseInt(item.product_currency_id),
          book_publisher_id: parseInt(item.book_publisher_id),
        };
        
        // Handle single or multiple categories
        if (item.product_category_id) {
          productData.product_category_id = parseInt(item.product_category_id);
        }
        
        return productData;
      });
      // create many product from an array of object
      const createdProduct = await prisma.product.createMany({
        data: data,
        skipDuplicates: true,
      });
      
      // After creating products, add categories if provided
      for (const item of req.body) {
        if (item.product_category_ids && Array.isArray(item.product_category_ids)) {
          const product = await prisma.product.findUnique({
            where: { isbn: item.isbn }
          });
          if (product) {
            const categoryIds = item.product_category_ids
              .map(id => Number(id))
              .filter(id => !isNaN(id) && id > 0);
            if (categoryIds.length > 0) {
              await prisma.product_product_category.createMany({
                data: categoryIds.map(categoryId => ({
                  product_id: product.id,
                  product_category_id: categoryId
                })),
                skipDuplicates: true
              });
            }
          }
        } else if (item.product_category_id) {
          const product = await prisma.product.findUnique({
            where: { isbn: item.isbn }
          });
          if (product) {
            const categoryId = Number(item.product_category_id);
            if (!isNaN(categoryId) && categoryId > 0) {
              await prisma.product_product_category.create({
                data: {
                  product_id: product.id,
                  product_category_id: categoryId
                }
              }).catch(() => {}); // Ignore if already exists
            }
          }
        }
      }
      
      // Create product_stock entries for each created product
      const stockData = [];
      for (const item of req.body) {
        const product = await prisma.product.findUnique({
          where: { isbn: item.isbn }
        });
        if (product) {
          stockData.push({
            product_id: product.id,
            company_id: companyId,
            quantity: parseInt(item.quantity) || 0,
            reorder_quantity: parseInt(item.reorder_quantity) || null,
          });
        }
      }
      if (stockData.length > 0) {
        await prisma.product_stock.createMany({
          data: stockData,
          skipDuplicates: true,
        });
      }
      // stock product's account transaction create with company_id
      await prisma.transaction.create({
        data: {
          date: new Date(),
          debit_id: 3,
          credit_id: 6,
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

      // Create product_stock entry for this company
      const purchasePrice = req.body.purchase_price && !isNaN(parseFloat(req.body.purchase_price)) ? parseFloat(req.body.purchase_price) : 0;
      const reorderQty = req.body.reorder_quantity && !isNaN(parseInt(req.body.reorder_quantity)) ? parseInt(req.body.reorder_quantity) : null;
      
      await prisma.product_stock.upsert({
        where: {
          product_id_company_id: {
            product_id: createdProduct.id,
            company_id: companyId,
          },
        },
        update: {
          quantity: quantity,
          reorder_quantity: reorderQty,
        },
        create: {
          product_id: createdProduct.id,
          company_id: companyId,
          quantity: quantity,
          reorder_quantity: reorderQty,
        },
      });

      // Create stock entries (multiple per product) if provided
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
      if (stockEntries.length > 0) {
        const stockData = stockEntries
          .filter(
            (e) =>
              e.locationId != null &&
              e.quantity != null &&
              !isNaN(Number(e.quantity)) &&
              Number(e.quantity) >= 0
          )
          .map((e) => ({
            product_id: createdProduct.id,
            company_id: companyId,
            location_id: Number(e.locationId),
            transaction_date: e.transactionDate ? new Date(e.transactionDate) : new Date(),
            purchase_price: parseFloat(e.purchasePrice) || 0,
            quantity: parseInt(e.quantity, 10) || 0,
            status: e.status !== false,
          }));
        if (stockData.length > 0) {
          await prisma.stock.createMany({ data: stockData });
        }
      }

      // stock product's account transaction create (only if quantity > 0 and purchase_price > 0)
      if (quantity > 0 && purchasePrice > 0) {
        await createTransactionWithSubAccounts({
          date: new Date(),
          sub_debit_id: 3, // Inventory
          sub_credit_id: 6, // Capital
          amount: purchasePrice * quantity,
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
      // Get pagination parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50; // Default to 50 instead of all
      const status = req.query.status !== "false";
      const viewMode = req.query.view_mode || "stock"; // "all" for all master products, "stock" for company stock only

      // Try to get from cache first (cache key should include company_id and view_mode)
      const cacheKey = `products:${companyId}:${status}:${page}:${limit}:${viewMode}`;
      const cachedData = await cacheService.getProducts(page, limit, status);
      
      if (cachedData && viewMode === "stock") {
        console.log('Products served from cache');
        return res.json(cachedData);
      }

      const skip = (page - 1) * limit;

      // Build where condition based on view_mode
      let whereCondition = {
        status: status,
      };

      // If view_mode is "stock", filter by products that have stock for this company
      if (viewMode === "stock") {
        const productIdsWithStock = await prisma.product_stock.findMany({
          where: { company_id: companyId },
          select: { product_id: true },
        });
        const productIds = productIdsWithStock.map(p => p.product_id);
        whereCondition.id = productIds.length > 0 ? { in: productIds } : { in: [] };
      }
      // If view_mode is "all", show all master products (no filter)
      
      const totalCount = await prisma.product.count({
        where: whereCondition
      });

      const allProduct = await prisma.product.findMany({
        where: whereCondition,
        orderBy: {
          id: "desc",
        },
        include: {
          product_category: {
            select: {
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
          product_currency: {
            select: {
              id: true,
              name: true,
              symbol: true,
              conversion: true
            },
          },
          book_publisher: {
            select: {
              name: true,
            },
          },
          product_stock: {
            where: { company_id: companyId },
            select: {
              quantity: true,
              reorder_quantity: true,
            },
          },
        },
        skip: skip,
        take: limit,
      });

      // Optimize image URL generation and add quantity from stock
      const productsWithImages = allProduct.map(product => {
        const stock = product.product_stock && product.product_stock.length > 0 ? product.product_stock[0] : null;
        // Transform categories array to include all categories
        const categories = product.product_categories?.map(pc => pc.product_category) || [];
        return {
          ...product,
          categories: categories, // Add categories array
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

      // Cache the response (only for stock view mode)
      if (viewMode === "stock") {
        await cacheService.setProducts(page, limit, status, responseData, 300); // 5 minutes cache
      }

      res.json(responseData);
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
          {
            name: {
              contains: searchTerm,
            },
          },
          {
            isbn: {
              contains: searchTerm,
            },
          },
          {
            author: {
              contains: searchTerm,
            },
          },
          {
            sku: {
              contains: searchTerm,
            },
          },
          {
            book_publisher: {
              name: {
                contains: searchTerm,
              },
            },
          },
        ],
        status: true,
      } : { status: true };
      
      // Filter by products that have stock for this company
      const productIdsWithStock = await prisma.product_stock.findMany({
        where: { company_id: companyId },
        select: { product_id: true },
      });
      const productIds = productIdsWithStock.map(p => p.product_id);
      if (productIds.length > 0) {
        searchConditions.id = { in: productIds };
      } else {
        searchConditions.id = { in: [] };
      }

      // Get total count for pagination
      const totalCount = await prisma.product.count({
        where: searchConditions
      });

      const allProduct = await prisma.product.findMany({
        where: searchConditions,
        orderBy: {
          id: "desc",
        },
        include: {
          product_category: {
            select: {
              name: true,
            },
          },
          product_currency: {
            select: {
              id: true,
              name: true,
              symbol: true,
              conversion: true,
            },
          },
          book_publisher: {
            select: {
              name: true,
            },
          },
          product_stock: {
            where: { company_id: companyId },
            select: {
              quantity: true,
              reorder_quantity: true,
            },
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

      // Optimize image URL generation
      const productsWithImages = allProduct.map(product => {
        const categories = product.product_categories?.map(pc => pc.product_category) || [];
        return {
          ...product,
          categories: categories, // Add categories array
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
    const totalCount = productsWithStock.length;
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
    console.log("false")

    try {
      const { skip, limit } = getPagination(req.query);
      // Get product IDs with stock for this company
      const productIdsWithStock = await prisma.product_stock.findMany({
        where: { company_id: companyId },
        select: { product_id: true },
      });
      const productIds = productIdsWithStock.map(p => p.product_id);
      
      const allProduct = await prisma.product.findMany({
        orderBy: {
          id: "desc",
        },
        where: {
          status: false,
          id: productIds.length > 0 ? { in: productIds } : { in: [] },
        },
        include: {
          product_category: {
            select: {
              name: true,
            },
          },
          product_currency: {
            select: {
              id: true,
              name: true,
              symbol: true,
              conversion: true,
            },
          },
          book_publisher: {
            select: {
              name: true,
            },
          },
          product_stock: {
            where: { company_id: companyId },
            select: {
              quantity: true,
              reorder_quantity: true,
            },
          },
        },
        skip: Number(skip),
        take: Number(limit),
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
    // Default paginated endpoint
    const { skip, limit } = getPagination(req.query);
    try {
      // Get product IDs with stock for this company
      const productIdsWithStock = await prisma.product_stock.findMany({
        where: { company_id: companyId },
        select: { product_id: true },
      });
      const productIds = productIdsWithStock.map(p => p.product_id);
      
      const allProduct = await prisma.product.findMany({
        orderBy: {
          id: "desc",
        },
        where: {
          status: true,
          id: productIds.length > 0 ? { in: productIds } : { in: [] },
        },
        include: {
          product_category: {
            select: {
              name: true,
            },
          },
          book_publisher: {
            select: {
              name: true,
            },
          },
          product_currency: {
            select: {
              id: true,
              name: true,
              symbol: true,
              conversion: true,
            },
          },
          product_stock: {
            where: { company_id: companyId },
            select: {
              quantity: true,
              reorder_quantity: true,
            },
          },
        },
        skip: Number(skip),
        take: Number(limit),
      });

      // Optimize image URL generation and add quantity from stock
      const productsWithImages = allProduct.map(product => {
        const categories = product.product_categories?.map(pc => pc.product_category) || [];
        return {
          ...product,
          categories: categories, // Add categories array
          quantity: product.product_stock && product.product_stock.length > 0 ? product.product_stock[0].quantity : 0,
          reorder_quantity: product.product_stock && product.product_stock.length > 0 ? product.product_stock[0].reorder_quantity : null,
          imageUrl: product.imageName ? `${HOST}:${PORT}/v1/product-image/${product.imageName}` : null
        };
      });

      res.json(productsWithImages);
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

    const singleProduct = await prisma.product.findUnique({
      where: {
        id: Number(req.params.id),
      },
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
        product_stock: {
          where: { company_id: companyId },
          select: {
            quantity: true,
            reorder_quantity: true,
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
      return res.status(404).json({ error: "Product not found" });
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
      // If no categories provided, delete all existing categories
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
    
    // Update product_stock for this company
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
      },
      create: {
        product_id: updatedProduct.id,
        company_id: companyId,
        quantity: quantity,
        reorder_quantity: reorderQuantity,
      },
    });

    // Replace stock entries (multiple per product) if provided
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
    if (stockEntries.length >= 0) {
      const productId = Number(req.params.id);
      await prisma.stock.deleteMany({
        where: { product_id: productId, company_id: companyId },
      });
      if (stockEntries.length > 0) {
        const stockData = stockEntries
          .filter(
            (e) =>
              e.locationId != null &&
              e.quantity != null &&
              !isNaN(Number(e.quantity)) &&
              Number(e.quantity) >= 0
          )
          .map((e) => ({
            product_id: productId,
            company_id: companyId,
            location_id: Number(e.locationId),
            transaction_date: e.transactionDate ? new Date(e.transactionDate) : new Date(),
            purchase_price: parseFloat(e.purchasePrice) || 0,
            quantity: parseInt(e.quantity, 10) || 0,
            status: e.status !== false,
          }));
        if (stockData.length > 0) {
          await prisma.stock.createMany({ data: stockData });
        }
      }
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

module.exports = {
  createSingleProduct,
  getAllProduct,
  getSingleProduct,
  updateSingleProduct,
  deleteSingleProduct,
};
