const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const OpenAI = require('openai');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const { jsonrepair } = require('jsonrepair');

const MAX_OPENAI_INPUT_LENGTH = 200000; // ~50k tokens approximation
const TEXT_CHUNK_SIZE = 14000;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/sale-bills';
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
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel' // .xls
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, PDF, Word, and Excel files are allowed.'));
    }
  }
});

// Function to encode image to base64
const encodeImage = (imagePath) => {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
};

const mergeExtractedData = (target, source) => {
  if (!source || typeof source !== 'object') return target;

  if (!target.customer && source.customer) {
    target.customer = source.customer;
  }
  if (!target.invoiceDate && source.invoiceDate) {
    target.invoiceDate = source.invoiceDate;
  }
  if (!target.invoiceNumber && source.invoiceNumber) {
    target.invoiceNumber = source.invoiceNumber;
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
    customer: null,
    invoiceDate: null,
    invoiceNumber: null,
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

// Function to extract text from Word document
const extractTextFromWord = async (wordPath) => {
  try {
    // Try to use mammoth if available, otherwise convert to base64 for OpenAI
    let mammoth;
    try {
      mammoth = require('mammoth');
    } catch (e) {
      // If mammoth is not installed, we'll use base64 approach
      const fileBuffer = fs.readFileSync(wordPath);
      return fileBuffer.toString('base64');
    }
    
    const result = await mammoth.extractRawText({ path: wordPath });
    return result.value;
  } catch (error) {
    console.error('Error extracting text from Word:', error);
    // Fallback to base64
    const fileBuffer = fs.readFileSync(wordPath);
    return fileBuffer.toString('base64');
  }
};

// Function to extract text from Excel
const extractTextFromExcel = async (excelPath) => {
  try {
    // Try to use xlsx if available
    let XLSX;
    try {
      XLSX = require('xlsx');
    } catch (e) {
      // If xlsx is not installed, we'll use base64 approach
      const fileBuffer = fs.readFileSync(excelPath);
      return fileBuffer.toString('base64');
    }
    
    const workbook = XLSX.readFile(excelPath);
    let text = '';
    
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const sheetText = XLSX.utils.sheet_to_csv(sheet);
      text += `Sheet: ${sheetName}\n${sheetText}\n\n`;
    });
    
    return text;
  } catch (error) {
    console.error('Error extracting text from Excel:', error);
    // Fallback to base64
    const fileBuffer = fs.readFileSync(excelPath);
    return fileBuffer.toString('base64');
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

    if (typeof content === 'string' && content.length > MAX_OPENAI_INPUT_LENGTH) {
      if (contentType === 'text') {
        return await analyzeLargeTextContent(content);
      }
      throw new Error('Bill content exceeds the maximum size supported for analysis. Please upload a smaller file or a PDF with selectable text.');
    }

    let messages;
    
    if (contentType === 'image') {
      messages = [
        {
          role: "system",
          content: `You are an AI assistant that extracts information from sales invoices/bills for books. 
          Extract the following information and return it as a JSON object:
          {
            "customer": {
              "name": "customer name",
              "phone": "phone number",
              "address": "full address"
            },
            "invoiceDate": "YYYY-MM-DD format",
            "invoiceNumber": "invoice/bill number",
            "products": [
              {
                "isbn": "ISBN number",
                "title": "book title",
                "name": "book name (same as title)",
                "author": "author name",
                "publisher": "publisher name",
                "quantity": number,
                "price": number (sale price),
                "currency": "currency symbol or code",
                "discount": number (percentage)
              }
            ]
          }
          
          If any field is not found, use null for strings/objects or 0 for numbers.
          For currency, try to identify the symbol (₹, $, €, etc.) or code (INR, USD, EUR, etc.).
          For ISBN, look for 10 or 13 digit numbers, often prefixed with "ISBN".
          Be very careful to extract accurate numerical values for price and quantity.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please analyze this sales invoice/bill and extract the information as requested."
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
      // For text content extracted from PDF, Word, or Excel
      messages = [
        {
          role: "system",
          content: `You are an AI assistant that extracts information from sales invoices/bills for books. 
          Extract the following information from the text and return it as a JSON object:
          {
            "customer": {
              "name": "customer name",
              "phone": "phone number", 
              "address": "full address"
            },
            "invoiceDate": "YYYY-MM-DD format",
            "invoiceNumber": "invoice/bill number",
            "products": [
              {
                "isbn": "ISBN number",
                "title": "book title",
                "name": "book name (same as title)",
                "author": "author name",
                "publisher": "publisher name",
                "quantity": number,
                "price": number (sale price),
                "currency": "currency symbol or code",
                "discount": number (percentage)
              }
            ]
          }
          
          If any field is not found, use null for strings/objects or 0 for numbers.
          For currency, try to identify the symbol (₹, $, €, etc.) or code (INR, USD, EUR, etc.).
          For ISBN, look for 10 or 13 digit numbers, often prefixed with "ISBN".
          Be very careful to extract accurate numerical values for price and quantity.`
        },
        {
          role: "user",
          content: `Please analyze this sales invoice/bill text and extract the information as requested:\n\n${content}`
        }
      ];
    } else if (contentType === 'text_chunk') {
      messages = [
        {
          role: "system",
          content: `You are an AI assistant that extracts information from sales invoices/bills for books.
          You will receive a portion of the bill text. Extract whatever relevant information you can find from this portion and return it as JSON with the structure:
          {
            "customer": { ... },
            "invoiceDate": "...",
            "invoiceNumber": "...",
            "products": [ ... ]
          }
          If a field cannot be determined from this chunk, set it to null (or 0 for numeric fields).`
        },
        {
          role: "user",
          content: `Bill text chunk:\n\n${content}`
        }
      ];
    } else if (contentType === 'pdf' || contentType === 'word' || contentType === 'excel') {
      messages = [
        {
          role: "system",
          content: `You are an AI assistant that extracts structured information from sales invoices/bills for books.
          You will receive a document encoded as a base64 string. Decode the document, read its contents (including running OCR if the document contains scanned images), and extract the following information.
          Return your answer strictly as JSON:
          {
            "customer": {
              "name": "customer name",
              "phone": "phone number",
              "address": "full address"
            },
            "invoiceDate": "YYYY-MM-DD format",
            "invoiceNumber": "invoice/bill number",
            "products": [
              {
                "isbn": "ISBN number",
                "title": "book title",
                "name": "book name (same as title)",
                "author": "author name",
                "publisher": "publisher name",
                "quantity": number,
                "price": number (sale price),
                "currency": "currency symbol or code",
                "discount": number (percentage)
              }
            ]
          }
          
          If any field is not found, use null for strings/objects or 0 for numbers.
          For currency, try to identify the symbol (₹, $, €, etc.) or code (INR, USD, EUR, etc.).
          For ISBN, look for 10 or 13 digit numbers, often prefixed with "ISBN".
          Be very careful to extract accurate numerical values for price and quantity.`
        },
        {
          role: "user",
          content: `The sales invoice document is provided below as a base64 encoded string. Decode it and extract the required information.\n\n${content}`
        }
      ];
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      max_tokens: 5000,
      temperature: 0.1,
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

// Function to check for existing customers and products
const checkExistingData = async (extractedData) => {
  const result = {
    existingCustomer: null,
    newCustomers: [],
    existingProducts: [],
    newProducts: [],
    newPublishers: [],
    newCurrencies: []
  };

  // Check customer
  if (extractedData.customer && extractedData.customer.name) {
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        OR: [
          { name: { contains: extractedData.customer.name } },
          extractedData.customer.phone ? { phone: extractedData.customer.phone } : {}
        ].filter(condition => Object.keys(condition).length > 0)
      }
    });

    if (existingCustomer) {
      result.existingCustomer = existingCustomer;
    } else {
      result.newCustomers.push(extractedData.customer);
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
            ...product,
            id: existingProduct.id,
            existing: true
          });
        } else {
          // Check for publisher
          if (product.publisher) {
            const existingPublisher = await prisma.book_publisher.findFirst({
              where: { name: { contains: product.publisher } }
            });

            if (!existingPublisher && !result.newPublishers.find(p => p.name === product.publisher)) {
              result.newPublishers.push({ name: product.publisher });
            }
          }

          // Check for currency
          if (product.currency) {
            const existingCurrency = await prisma.product_currency.findFirst({
              where: {
                OR: [
                  { symbol: { contains: product.currency } },
                  { name: { contains: product.currency } }
                ]
              }
            });

            if (!existingCurrency && !result.newCurrencies.find(c => c.symbol === product.currency || c.name === product.currency)) {
              result.newCurrencies.push({ symbol: product.currency, name: product.currency });
            }
          }

          result.newProducts.push(product);
        }
      } else {
        // Product without ISBN - treat as new
        result.newProducts.push(product);
      }
    }
  }

  return result;
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
      customer: null,
      invoiceDate: null,
      invoiceNumber: null,
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
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                 file.mimetype === 'application/msword') {
        // Word document
        content = await extractTextFromWord(file.path);
        contentType = typeof content === 'string' && content.length < 1000 && !content.includes('\n') ? 'word' : 'text';
        
        if (contentType === 'word') {
          // If text extraction failed or returned base64, use base64
          const fileBuffer = fs.readFileSync(file.path);
          content = fileBuffer.toString('base64');
        }
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                 file.mimetype === 'application/vnd.ms-excel') {
        // Excel document
        content = await extractTextFromExcel(file.path);
        contentType = typeof content === 'string' && content.length < 1000 && !content.includes('\n') ? 'excel' : 'text';
        
        if (contentType === 'excel') {
          // If text extraction failed or returned base64, use base64
          const fileBuffer = fs.readFileSync(file.path);
          content = fileBuffer.toString('base64');
        }
      } else {
        // Image file
        content = encodeImage(file.path);
        contentType = 'image';
      }

      const extractedData = await analyzeBillContent(content, contentType);

      // Merge data from multiple files
      if (extractedData.customer && !allExtractedData.customer) {
        allExtractedData.customer = extractedData.customer;
      }
      if (extractedData.invoiceDate && !allExtractedData.invoiceDate) {
        allExtractedData.invoiceDate = extractedData.invoiceDate;
      }
      if (extractedData.invoiceNumber && !allExtractedData.invoiceNumber) {
        allExtractedData.invoiceNumber = extractedData.invoiceNumber;
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

    // Check for existing customers and products
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
    const { customer, products } = req.body;

    if (!customer || !products) {
      return res.status(400).json({ message: 'Customer and products data required' });
    }

    // Create the extractedData object in the format expected by checkExistingData
    const extractedData = {
      customer,
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
  analyzeBill,
  analyzeNewItems,
};

