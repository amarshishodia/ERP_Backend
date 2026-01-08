const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
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
      // delete many product at once (only for user's company)
      const deletedProduct = await prisma.product.deleteMany({
        where: {
          id: {
            in: req.body.map((id) => Number(id)),
          },
          company_id: companyId,
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
      // convert incoming data to specific format with company_id
      const data = req.body.map((item) => {
        return {
          name: item.name,
          quantity: parseInt(item.quantity),
          purchase_price: parseFloat(item.purchase_price),
          sale_price: parseFloat(item.sale_price),
          product_category_id: parseInt(item.product_category_id),
          sku: item.sku,
          unit_measurement: parseFloat(item.unit_measurement),
          unit_type: item.unit_type,
          reorder_quantity: parseInt(item.reorder_quantity),
          isbn: item.isbn,
          author: item.author,
          product_currency_id: parseInt(item.product_currency_id),
          book_publisher_id: parseInt(item.book_publisher_id),
          company_id: companyId,
        };
      });
      // create many product from an array of object
      const createdProduct = await prisma.product.createMany({
        data: data,
        skipDuplicates: true,
      });
      // stock product's account transaction create with company_id
      await prisma.transaction.create({
        data: {
          date: new Date(),
          debit_id: 3,
          credit_id: 6,
          amount: totalPurchasePrice,
          particulars: `Initial stock of ${createdProduct.count} item/s of product`,
          company_id: companyId,
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

      // Check if ISBN is already taken for this company
      const existingProduct = await prisma.product.findFirst({
        where: {
          isbn: req.body.isbn,
          company_id: companyId,
        },
      });

      if (existingProduct) {
        return res.status(400).json({ message: 'ISBN is already taken.' });
      }

      const file = req.file;

      // Prepare data object with proper handling of optional fields
      const productData = {
        isbn: req.body.isbn,
        name: req.body.name,
        author: req.body.author || null,
        company_id: companyId,
        book_publisher: {
          connect: { id: Number(req.body.book_publisher_id) }
        },
        product_currency: {
          connect: { id: Number(req.body.product_currency_id) }
        },
        purchase_price: req.body.purchase_price ? parseFloat(req.body.purchase_price) : 0,
        sale_price: parseFloat(req.body.sale_price),
        imageName: file?.filename || '',
        unit_type: req.body.unit_type,
      };

      // Set quantity - use provided value or default to 0
      productData.quantity = req.body.quantity && !isNaN(parseInt(req.body.quantity)) 
        ? parseInt(req.body.quantity) 
        : 0;

      if (req.body.product_category_id && !isNaN(Number(req.body.product_category_id))) {
        productData.product_category = {
          connect: { id: Number(req.body.product_category_id) }
        };
      }

      if (req.body.unit_measurement && !isNaN(parseFloat(req.body.unit_measurement))) {
        productData.unit_measurement = parseFloat(req.body.unit_measurement);
      }

      const createdProduct = await prisma.product.create({
        data: productData,
      });
      file?.filename?
      createdProduct.imageUrl = `${HOST}:${PORT}/v1/product-image/${file.filename}`:'';

const subAcc = await prisma.subAccount.findUnique({ where: { id: 6 } });
console.log("Credit subAccount:", subAcc);


      // stock product's account transaction create (only if quantity > 0 and purchase_price > 0)
      const quantity = req.body.quantity && !isNaN(parseInt(req.body.quantity)) ? parseInt(req.body.quantity) : 0;
      const purchasePrice = req.body.purchase_price && !isNaN(parseFloat(req.body.purchase_price)) ? parseFloat(req.body.purchase_price) : 0;
      
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

      // Try to get from cache first (cache key should include company_id)
      const cacheKey = `products:${companyId}:${status}:${page}:${limit}`;
      const cachedData = await cacheService.getProducts(page, limit, status);
      
      if (cachedData) {
        console.log('Products served from cache');
        return res.json(cachedData);
      }

      const skip = (page - 1) * limit;

      // Get total count for pagination
      const totalCount = await prisma.product.count({
        where: {
          status: status,
          company_id: companyId,
        }
      });

      const allProduct = await prisma.product.findMany({
        where: {
          status: status,
          company_id: companyId,
        },
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
              conversion: true
            },
          },
          book_publisher: {
            select: {
              name: true,
            },
          },
        },
        skip: skip,
        take: limit,
      });

      // Optimize image URL generation
      const productsWithImages = allProduct.map(product => ({
        ...product,
        imageUrl: product.imageName ? `${HOST}:${PORT}/v1/product-image/${product.imageName}` : null
      }));

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

      // Cache the response
      await cacheService.setProducts(page, limit, status, responseData, 300); // 5 minutes cache

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
        company_id: companyId,
      } : { status: true, company_id: companyId };

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
      const productsWithImages = allProduct.map(product => ({
        ...product,
        imageUrl: product.imageName ? `${HOST}:${PORT}/v1/product-image/${product.imageName}` : null
      }));

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
    const aggregations = await prisma.product.aggregate({
      _count: {
        id: true,
      },
      _sum: {
        quantity: true,
      },
      where: {
        status: true,
        company_id: companyId,
      },
    });
    // get all product and calculate all purchase price and sale price
    const allProduct = await prisma.product.findMany({
      where: {
        company_id: companyId,
      },
    });
    const totalPurchasePrice = allProduct.reduce((acc, cur) => {
      return acc + cur.quantity * cur.purchase_price;
    }, 0);
    const totalSalePrice = allProduct.reduce((acc, cur) => {
      return acc + cur.quantity * cur.sale_price;
    }, 0);
    res.json({ ...aggregations, totalPurchasePrice, totalSalePrice });
  } else if (req.query.status === "false") {
    console.log("false")

    try {
      const { skip, limit } = getPagination(req.query);
      const allProduct = await prisma.product.findMany({
        orderBy: {
          id: "desc",
        },
        where: {
          status: false,
          company_id: companyId,
        },
        include: {
          product_category: {
            select: {
              name: true,
            },
          },
        },
        include: {
          product_currency: {
            select: {
              id: true,
              name: true,
              symbol: true,
              conversion: true,
            },
          },
        },
        include: {
          book_publisher: {
            select: {
              name: true,
            },
          },
        },
        skip: Number(skip),
        take: Number(limit),
      });
      // attach signed url to each product
      for (let product of allProduct) {
        if (product.imageName) {
          product.imageUrl = `${HOST}:${PORT}/v1/product-image/${product.imageName}`;
        }
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
      const allProduct = await prisma.product.findMany({
        orderBy: {
          id: "desc",
        },
        where: {
          status: true,
          company_id: companyId,
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
        },
        skip: Number(skip),
        take: Number(limit),
      });

      // Optimize image URL generation
      const productsWithImages = allProduct.map(product => ({
        ...product,
        imageUrl: product.imageName ? `${HOST}:${PORT}/v1/product-image/${product.imageName}` : null
      }));

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
    });

    if (!singleProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Verify that the product belongs to the user's company
    if (singleProduct.company_id !== companyId) {
      return res.status(403).json({ error: "Product does not belong to your company" });
    }

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

    // Verify that the product belongs to the user's company
    const existingProduct = await prisma.product.findUnique({
      where: { id: Number(req.params.id) },
      select: { company_id: true },
    });

    if (!existingProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (existingProduct.company_id !== companyId) {
      return res.status(403).json({ error: "Product does not belong to your company" });
    }

    const file = req.file;
    
    const updateData = {
      name: req.body.name,
      author: req.body.author,
      book_publisher_id: Number(req.body.book_publisher_id),
      quantity: parseInt(req.body.quantity),
      product_currency_id: Number(req.body.product_currency_id),
      purchase_price: parseFloat(req.body.purchase_price),
      sale_price: parseFloat(req.body.sale_price),
      product_category_id: Number(req.body.product_category_id),
      unit_measurement: parseFloat(req.body.unit_measurement),
      unit_type: req.body.unit_type,
      reorder_quantity: parseInt(req.body.reorder_quantity),
    };

    // Only update image if a new file is provided
    if (file?.filename) {
      updateData.imageName = file.filename;
    }

    const updatedProduct = await prisma.product.update({
      where: {
        id: Number(req.params.id),
      },
      data: updateData,
    });

    // Add image URL if image exists
    if (updatedProduct.imageName) {
      updatedProduct.imageUrl = `${HOST}:${PORT}/v1/product-image/${updatedProduct.imageName}`;
    }

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

    // Verify that the product belongs to the user's company
    const existingProduct = await prisma.product.findUnique({
      where: { id: Number(req.params.id) },
      select: { company_id: true },
    });

    if (!existingProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (existingProduct.company_id !== companyId) {
      return res.status(403).json({ error: "Product does not belong to your company" });
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
