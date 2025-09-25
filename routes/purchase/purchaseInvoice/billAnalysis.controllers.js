const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const OpenAI = require('openai');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');

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

// Function to encode image to base64
const encodeImage = (imagePath) => {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
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
          Be very careful to extract accurate numerical values for price and quantity.`
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
    } else {
      // For text content (PDF)
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
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      max_tokens: 2000,
      temperature: 0.1,
    });

    const extractedText = response.choices[0].message.content;
    
    // Try to parse JSON from the response
    let jsonMatch = extractedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Could not extract valid JSON from AI response');
    }
  } catch (error) {
    console.error('Error analyzing bill with OpenAI:', error);
    throw new Error('Failed to analyze bill content');
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
        const existingProduct = await prisma.product.findFirst({
          where: {
            AND: [
              product.title ? { name: { contains: product.title } } : {},
              product.author ? { author: { contains: product.author } } : {}
            ].filter(condition => Object.keys(condition).length > 0)
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
          // Check if publisher exists
          let publisherId = null;
          if (product.publisher) {
            const existingPublisher = await prisma.bookPublisher.findFirst({
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
            const existingCurrency = await prisma.productCurrency.findFirst({
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

// Main controller function
const analyzeBill = async (req, res) => {
  try {
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

module.exports = {
  upload,
  analyzeBill,
};
