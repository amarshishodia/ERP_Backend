const prisma = require("../../../utils/prisma");
const OpenAI = require('openai');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');
const { jsonrepair } = require('jsonrepair');

const MAX_OPENAI_INPUT_LENGTH = 200000; // ~50k tokens approximation
const TEXT_CHUNK_SIZE = 14000;
/** Chunk text PDFs above this size so each API call can return a complete products array (avoids output truncation on long bills). */
const TEXT_CHUNKING_THRESHOLD = 8000;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/bills';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and PDF files are allowed.'));
    }
  }
});

const excelUpload = multer({
  storage: storage,
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExt = ['.xlsx', '.xls'];
    const allowedMime = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ];
    if (allowedExt.includes(ext) || allowedMime.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) are allowed.'));
    }
  },
});

// Function to encode image to base64
const encodeImage = (imagePath) => {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
};

const mergeExtractedData = (target, source) => {
  if (!source || typeof source !== 'object') return target;

  if (!target.supplier && source.supplier) {
    target.supplier = source.supplier;
  }
  if (!target.billDate && source.billDate) {
    target.billDate = source.billDate;
  }
  if (!target.billNumber && source.billNumber) {
    target.billNumber = source.billNumber;
  }
  if (Array.isArray(source.products) && source.products.length) {
    target.products = target.products.concat(source.products);
  }

  return target;
};

const analyzeLargeTextContent = async (content) => {
  const chunks = [];
  for (let i = 0; i < content.length; i += TEXT_CHUNK_SIZE) {
    chunks.push(content.slice(i, i + TEXT_CHUNK_SIZE));
  }

  let aggregated = {
    supplier: null,
    billDate: null,
    billNumber: null,
    products: [],
  };

  for (const chunk of chunks) {
    const chunkResult = await analyzeBillContent(chunk, 'text_chunk');
    aggregated = mergeExtractedData(aggregated, chunkResult);
  }

  return aggregated;
};

// Function to extract text from PDF
const extractTextFromPDF = async (pdfPath) => {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
};

// Function to analyze bill content with OpenAI
const analyzeBillContent = async (content, contentType = 'image') => {
  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is not configured');
    }

    // Validate content
    if (!content || (typeof content === 'string' && content.trim() === '')) {
      throw new Error('No content provided for analysis');
    }

    // Text PDFs above threshold: process in chunks so each response can list all line items in that segment (single-call extraction often truncates long product lists).
    if (contentType === 'text' && typeof content === 'string' && content.length > TEXT_CHUNKING_THRESHOLD) {
      return await analyzeLargeTextContent(content);
    }

    if (typeof content === 'string' && content.length > MAX_OPENAI_INPUT_LENGTH) {
      throw new Error('Bill content exceeds the maximum size supported for analysis. Please upload a smaller file or a PDF with selectable text.');
    }

    let messages;

    if (contentType === 'image') {
      messages = [
        {
          role: "system",
          content: `You are an AI assistant that extracts information from purchase bills/invoices for books. 
          Extract the following information and return it as a JSON object:
          {
            "supplier": {
              "name": "supplier name",
              "phone": "phone number",
              "address": "full address"
            },
            "billDate": "YYYY-MM-DD format",
            "billNumber": "bill/invoice number",
            "products": [
              {
                "isbn": "ISBN number",
                "title": "book title",
                "author": "author name",
                "publisher": "publisher name",
                "quantity": number,
                "price": number,
                "currency": "currency symbol or code",
                "discount": number (percentage)
              }
            ]
          }
          
          If any field is not found, use null for strings/objects or 0 for numbers.
          For currency, try to identify the symbol (₹, $, €, etc.) or code (INR, USD, EUR, etc.).
          For ISBN, look for 10 or 13 digit numbers, often prefixed with "ISBN".
          Be very careful to extract accurate numerical values for price and quantity.
          Include every line item in the products array—do not truncate or return only the first few rows.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please analyze this purchase bill/invoice and extract the information as requested."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${content}`
              }
            }
          ]
        }
      ];
    } else if (contentType === 'text') {
      // For text content extracted from PDF
      messages = [
        {
          role: "system",
          content: `You are an AI assistant that extracts information from purchase bills/invoices for books. 
          Extract the following information from the text and return it as a JSON object:
          {
            "supplier": {
              "name": "supplier name",
              "phone": "phone number", 
              "address": "full address"
            },
            "billDate": "YYYY-MM-DD format",
            "billNumber": "bill/invoice number",
            "products": [
              {
                "isbn": "ISBN number",
                "title": "book title",
                "author": "author name",
                "publisher": "publisher name",
                "quantity": number,
                "price": number,
                "currency": "currency symbol or code",
                "discount": number (percentage)
              }
            ]
          }
          
          Important: include EVERY book line item from the bill—one object per row in the products array. Do not summarize, sample, or cap the list (e.g. do not return only the first 10 items).
          If any field is not found, use null for strings/objects or 0 for numbers.
          For currency, try to identify the symbol (₹, $, €, etc.) or code (INR, USD, EUR, etc.).
          For ISBN, look for 10 or 13 digit numbers, often prefixed with "ISBN".
          Be very careful to extract accurate numerical values for price and quantity.`
        },
        {
          role: "user",
          content: `Please analyze this purchase bill/invoice text and extract the information as requested:\n\n${content}`
        }
      ];
    } else if (contentType === 'text_chunk') {
      messages = [
        {
          role: "system",
          content: `You are an AI assistant that extracts information from purchase bills/invoices for books.
          You will receive ONE portion of a longer bill. Your job is to extract EVERY book line item that appears in this portion only—do not skip, summarize, or cap the number of rows. If this chunk contains 40 table rows, the "products" array must have 40 entries (one per row).
          Return JSON with this structure:
          {
            "supplier": { "name": "...", "phone": "...", "address": "..." },
            "billDate": "YYYY-MM-DD or null",
            "billNumber": "... or null",
            "products": [ { "isbn", "title", "author", "publisher", "quantity", "price", "currency", "discount" } ]
          }
          If supplier/date/bill number are not visible in this chunk, set them to null. Use null for missing strings, 0 for missing numbers.
          For currency and ISBN, follow the same rules as a full-bill extraction.`
        },
        {
          role: "user",
          content: `Bill text chunk:\n\n${content}`
        }
      ];
    } else if (contentType === 'pdf') {
      messages = [
        {
          role: "system",
          content: `You are an AI assistant that extracts structured information from purchase bills/invoices for books.
          You will receive a PDF document encoded as a base64 string. Decode the PDF, read its contents (including running OCR if the PDF contains scanned images), and extract the following information.
          Return your answer strictly as JSON:
          {
            "supplier": {
              "name": "supplier name",
              "phone": "phone number",
              "address": "full address"
            },
            "billDate": "YYYY-MM-DD format",
            "billNumber": "bill/invoice number",
            "products": [
              {
                "isbn": "ISBN number",
                "title": "book title",
                "author": "author name",
                "publisher": "publisher name",
                "quantity": number,
                "price": number,
                "currency": "currency symbol or code",
                "discount": number (percentage)
              }
            ]
          }
          
          If any field is not found, use null for strings/objects or 0 for numbers.
          For currency, try to identify the symbol (₹, $, €, etc.) or code (INR, USD, EUR, etc.).
          For ISBN, look for 10 or 13 digit numbers, often prefixed with "ISBN".
          Be very careful to extract accurate numerical values for price and quantity.
          Include every line item on all pages in the products array—do not truncate or return only the first few rows.`
        },
        {
          role: "user",
          content: `The purchase invoice PDF is provided below as a base64 encoded string. Decode it and extract the required information.\n\n${content}`
        }
      ];
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      max_tokens: 16384,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const extractedText = response.choices[0].message.content;
    if (!extractedText) {
      throw new Error('Received empty response from AI');
    }

    // Try to parse JSON from the response
    let jsonMatch = extractedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        try {
          const repairedJson = jsonrepair(jsonMatch[0]);
          return JSON.parse(repairedJson);
        } catch (repairError) {
          console.error('Failed to repair JSON:', repairError);
          throw new Error('Could not extract valid JSON from AI response');
        }
      }
    } else {
      throw new Error('Could not extract valid JSON from AI response');
    }
  } catch (error) {
    console.error('Error analyzing bill with OpenAI:', error);
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.type
    });
    throw new Error(`Failed to analyze bill content: ${error.message}`);
  }
};

// Function to check for existing suppliers and products
const checkExistingData = async (extractedData) => {
  const result = {
    existingSupplier: null,
    newSuppliers: [],
    existingProducts: [],
    newProducts: [],
    newPublishers: [],
    newCurrencies: []
  };

  // Check supplier
  if (extractedData.supplier && extractedData.supplier.name) {
    const existingSupplier = await prisma.supplier.findFirst({
      where: {
        OR: [
          { name: { contains: extractedData.supplier.name } },
          extractedData.supplier.phone ? { phone: extractedData.supplier.phone } : {}
        ].filter(condition => Object.keys(condition).length > 0)
      }
    });

    if (existingSupplier) {
      result.existingSupplier = existingSupplier;
    } else {
      result.newSuppliers.push(extractedData.supplier);
    }
  }

  // Check products and their dependencies (publishers, currencies)
  if (extractedData.products && extractedData.products.length > 0) {
    for (const product of extractedData.products) {
      if (product.isbn) {
        const existingProduct = await prisma.product.findFirst({
          where: { isbn: product.isbn },
          include: {
            book_publisher: true,
            product_currency: true
          }
        });

        if (existingProduct) {
          result.existingProducts.push({
            ...existingProduct,
            extractedQuantity: product.quantity,
            extractedPrice: product.price,
            extractedDiscount: product.discount
          });
        } else {
          result.newProducts.push(product);
        }
      } else {
        // If no ISBN, try to match by title and author
        const andConditions = [
          product.title ? { name: { contains: product.title } } : {},
          product.author ? { author: { contains: product.author } } : {}
        ].filter((condition) => Object.keys(condition).length > 0);

        let existingProduct = null;
        if (andConditions.length > 0) {
          existingProduct = await prisma.product.findFirst({
            where: { AND: andConditions },
          });
        }

        if (existingProduct) {
          result.existingProducts.push({
            ...existingProduct,
            extractedQuantity: product.quantity,
            extractedPrice: product.price,
            extractedDiscount: product.discount
          });
        } else {
          // Check if publisher exists
          let publisherId = null;
          if (product.publisher) {
            const existingPublisher = await prisma.book_publisher.findFirst({
              where: { name: { contains: product.publisher } }
            });

            if (existingPublisher) {
              publisherId = existingPublisher.id;
            } else {
              // Add to new publishers list
              const newPublisher = { name: product.publisher };
              const existingNewPub = result.newPublishers.find(p => p.name === product.publisher);
              if (!existingNewPub) {
                result.newPublishers.push(newPublisher);
              }
            }
          }

          // Check if currency exists
          let currencyId = null;
          if (product.currency) {
            const existingCurrency = await prisma.product_currency.findFirst({
              where: { name: { contains: product.currency } }
            });

            if (existingCurrency) {
              currencyId = existingCurrency.id;
            } else {
              // Add to new currencies list
              const newCurrency = { name: product.currency, symbol: product.currency };
              const existingNewCurr = result.newCurrencies.find(c => c.name === product.currency);
              if (!existingNewCurr) {
                result.newCurrencies.push(newCurrency);
              }
            }
          }

          result.newProducts.push({
            ...product,
            publisherId,
            currencyId
          });
        }
      }
    }
  }

  return result;
};

function normalizeExcelHeaderKey(h) {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Pick the first column whose normalized header matches one of the candidates (exact), else substring match.
 */
function pickExcelColumn(headerKeys, candidates) {
  const normalizedHeaders = headerKeys.map((raw) => ({
    raw,
    key: normalizeExcelHeaderKey(raw),
  }));

  for (const cand of candidates) {
    const c = normalizeExcelHeaderKey(cand);
    const exact = normalizedHeaders.find((h) => h.key === c);
    if (exact) return exact.raw;
  }
  for (const cand of candidates) {
    const c = normalizeExcelHeaderKey(cand);
    const partial = normalizedHeaders.find(
      (h) => (c.length >= 3 && (h.key.includes(c) || c.includes(h.key))) || h.key === c
    );
    if (partial) return partial.raw;
  }
  return null;
}

function parseExcelNumeric(val) {
  if (val === '' || val == null) return 0;
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  const s = String(val).replace(/,/g, '').replace(/^\s*[₹$€]\s*/i, '').trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeExcelIsbn(val) {
  if (val === '' || val == null) return null;
  // Excel often stores ISBN-13 as a number; raw:false turns it into "9.78936E+12" which is unusable.
  if (typeof val === 'number' && Number.isFinite(val)) {
    if (val >= 1e9) return String(Math.round(val));
    if (Number.isInteger(val)) return String(val);
  }
  let s = String(val).trim().replace(/[\s-]/g, '');
  if (/^[\d.]+e[+-]?\d+$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && n >= 1e9) return String(Math.round(n));
  }
  if (/^\d+\.?\d*$/.test(s) && !/e/i.test(s)) {
    const n = parseFloat(s);
    if (Number.isFinite(n) && n >= 1e9) return String(Math.round(n));
  }
  return s || null;
}

function formatExcelDateMaybe(val) {
  if (val === '' || val == null) return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/**
 * Parse purchase lines from the first worksheet. No AI — column headers are matched flexibly.
 * Expected columns (at least one of ISBN or Title per row): ISBN, Title, Author, Publisher, Price, Qty.
 * Optional: Discount, Currency, Supplier name, Supplier phone, Supplier address, Bill date, Bill number.
 */
const parsePurchaseExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No Excel file uploaded' });
    }

    const filePath = req.file.path;
    let workbook;
    try {
      workbook = XLSX.readFile(filePath, { cellDates: true });
    } catch (e) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(400).json({
        message: 'Could not read this file. Use a valid .xlsx or .xls spreadsheet.',
      });
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // raw:true keeps ISBN-13 as numeric (large integers). raw:false formats them as "9.78936E+12".
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    if (!rows.length) {
      return res.status(400).json({
        message: 'The spreadsheet is empty. Add a header row and at least one data row.',
      });
    }

    const headerKeys = Object.keys(rows[0]);
    const col = {
      isbn: pickExcelColumn(headerKeys, ['isbn', 'isbn13', 'isbn 13', 'book isbn']),
      title: pickExcelColumn(headerKeys, ['title', 'book title', 'book name', 'book']),
      author: pickExcelColumn(headerKeys, ['author', 'writer']),
      publisher: pickExcelColumn(headerKeys, ['publisher', 'pub', 'publisher name']),
      price: pickExcelColumn(headerKeys, [
        'price',
        'price rs',
        'rate',
        'mrp',
        'unit price',
        'purchase price',
        'cost',
      ]),
      qty: pickExcelColumn(headerKeys, ['qty', 'quantity', 'qty.', 'copies', 'nos', 'no']),
      discount: pickExcelColumn(headerKeys, ['discount', 'disc', 'dis', 'dis %']),
      currency: pickExcelColumn(headerKeys, ['currency', 'curr']),
      supplierName: pickExcelColumn(headerKeys, ['supplier', 'supplier name', 'vendor', 'vendor name']),
      supplierPhone: pickExcelColumn(headerKeys, [
        'supplier phone',
        'supplier contact',
        'vendor phone',
        'phone',
      ]),
      supplierAddress: pickExcelColumn(headerKeys, ['supplier address', 'vendor address', 'address']),
      billDate: pickExcelColumn(headerKeys, ['bill date', 'invoice date', 'date', 'billdate']),
      billNumber: pickExcelColumn(headerKeys, [
        'bill number',
        'invoice no',
        'invoice number',
        'invoice',
        'memo',
        'memo no',
        'supplier memo',
      ]),
    };

    if (!col.title && !col.isbn) {
      return res.status(400).json({
        message:
          'Could not detect Title or ISBN columns. Use headers such as ISBN, Title, Author, Publisher, Price, Qty in the first row.',
      });
    }

    let supplierMeta = null;
    if (col.supplierName) {
      for (const row of rows) {
        const name = String(row[col.supplierName] ?? '').trim();
        if (name) {
          supplierMeta = {
            name,
            phone: col.supplierPhone ? String(row[col.supplierPhone] ?? '').trim() || null : null,
            address: col.supplierAddress ? String(row[col.supplierAddress] ?? '').trim() || null : null,
          };
          break;
        }
      }
    }

    let billDate = null;
    if (col.billDate) {
      for (const row of rows) {
        const d = formatExcelDateMaybe(row[col.billDate]);
        if (d) {
          billDate = d;
          break;
        }
      }
    }

    let billNumber = null;
    if (col.billNumber) {
      for (const row of rows) {
        const v = row[col.billNumber];
        if (v !== '' && v != null) {
          billNumber = String(v).trim();
          if (billNumber) break;
        }
      }
    }

    const products = [];
    for (const row of rows) {
      const title = col.title ? String(row[col.title] ?? '').trim() : '';
      const isbn = col.isbn ? normalizeExcelIsbn(row[col.isbn]) : null;
      if (!title && !isbn) continue;

      const qty = col.qty ? parseExcelNumeric(row[col.qty]) : 0;
      const price = col.price ? parseExcelNumeric(row[col.price]) : 0;
      const disc = col.discount ? parseExcelNumeric(row[col.discount]) : 0;
      let currency = col.currency ? String(row[col.currency] ?? '').trim() : '';
      if (!currency) currency = '₹';

      const author = col.author ? String(row[col.author] ?? '').trim() : '';
      const publisher = col.publisher ? String(row[col.publisher] ?? '').trim() : '';

      products.push({
        isbn: isbn || null,
        title: title || null,
        author: author || null,
        publisher: publisher || null,
        quantity: qty || 0,
        price,
        currency,
        discount: disc || 0,
      });
    }

    if (products.length === 0) {
      return res.status(400).json({
        message:
          'No product rows found. Each row needs at least an ISBN or Title (empty rows are skipped).',
      });
    }

    const seenISBNs = new Set();
    const uniqueProducts = [];
    for (const p of products) {
      if (p.isbn) {
        if (!seenISBNs.has(p.isbn)) {
          seenISBNs.add(p.isbn);
          uniqueProducts.push(p);
        }
      } else {
        uniqueProducts.push(p);
      }
    }

    const extractedData = {
      supplier: supplierMeta,
      billDate,
      billNumber,
      products: uniqueProducts,
    };

    const dataCheck = await checkExistingData(extractedData);
    res.json({
      ...extractedData,
      ...dataCheck,
    });
  } catch (error) {
    console.error('Error in parsePurchaseExcel:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {}
    }
    res.status(500).json({
      message: error.message || 'Failed to import Excel',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

// Main controller function
const analyzeBill = async (req, res) => {
  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      return res.status(500).json({
        message: 'OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.',
        error: 'Missing OpenAI API key configuration'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    let allExtractedData = {
      supplier: null,
      billDate: null,
      billNumber: null,
      products: []
    };

    // Process each uploaded file
    for (const file of req.files) {
      let content;
      let contentType;

      if (file.mimetype === 'application/pdf') {
        content = await extractTextFromPDF(file.path);
        contentType = 'text';

        if (!content || content.trim() === '') {
          const pdfBase64 = fs.readFileSync(file.path).toString('base64');
          content = pdfBase64;
          contentType = 'pdf';
        }
      } else {
        content = encodeImage(file.path);
        contentType = 'image';
      }

      const extractedData = await analyzeBillContent(content, contentType);

      // Merge data from multiple files
      if (extractedData.supplier && !allExtractedData.supplier) {
        allExtractedData.supplier = extractedData.supplier;
      }
      if (extractedData.billDate && !allExtractedData.billDate) {
        allExtractedData.billDate = extractedData.billDate;
      }
      if (extractedData.billNumber && !allExtractedData.billNumber) {
        allExtractedData.billNumber = extractedData.billNumber;
      }
      if (extractedData.products && extractedData.products.length > 0) {
        allExtractedData.products.push(...extractedData.products);
      }

      // Clean up uploaded file
      fs.unlinkSync(file.path);
    }

    // Remove duplicate products based on ISBN
    const uniqueProducts = [];
    const seenISBNs = new Set();

    for (const product of allExtractedData.products) {
      if (product.isbn) {
        if (!seenISBNs.has(product.isbn)) {
          seenISBNs.add(product.isbn);
          uniqueProducts.push(product);
        }
      } else {
        uniqueProducts.push(product);
      }
    }
    allExtractedData.products = uniqueProducts;

    // Check for existing suppliers and products
    const dataCheck = await checkExistingData(allExtractedData);

    // Prepare response
    const response = {
      ...allExtractedData,
      ...dataCheck
    };

    res.json(response);
  } catch (error) {
    console.error('Error in analyzeBill:', error);

    // Clean up uploaded files in case of error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }

    res.status(500).json({
      message: error.message || 'Failed to analyze bill',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Controller function to analyze new items after user confirms data
const analyzeNewItems = async (req, res) => {
  try {
    const { supplier, products } = req.body;

    if (!supplier || !products) {
      return res.status(400).json({ message: 'Supplier and products data required' });
    }

    // Create the extractedData object in the format expected by checkExistingData
    const extractedData = {
      supplier,
      products
    };

    // Use the existing checkExistingData function
    const result = await checkExistingData(extractedData);

    res.json(result);
  } catch (error) {
    console.error('Error analyzing new items:', error);
    res.status(500).json({
      message: 'Failed to analyze new items',
      error: error.message
    });
  }
};

module.exports = {
  upload,
  excelUpload,
  analyzeBill,
  parsePurchaseExcel,
  analyzeNewItems,
};
