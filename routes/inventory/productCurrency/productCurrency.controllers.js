const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { getObjectSignedUrl } = require("../../../utils/s3");

const createSingleProductCurrency = async (req, res) => {
	if (req.query.query === "deletemany") {
		try {
			// delete many product_currency at once (not company-specific)
			const deletedProductCurrency = await prisma.product_currency.deleteMany({
				where: {
					id: {
						in: req.body.map((id) => parseInt(id)),
					},
				},
			});
			res.json(deletedProductCurrency);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	} else if (req.query.query === "createmany") {
		try {
			// create many product_currency from an array of objects (not company-specific)
			const createdProductCurrency = await prisma.product_currency.createMany({
				data: req.body.map((product_currency) => {
					return {
						name: product_currency.name,
						symbol: product_currency.symbol,
						company_id: 1, // Use default company_id or first company
					};
				}),
				skipDuplicates: true,
			});
			res.json(createdProductCurrency);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
		} else {
		try {
			// Get first company_id for currency (currencies are shared, not company-specific)
			const firstCompany = await prisma.appSetting.findFirst({
				select: { id: true },
			});
			
			// create single product_currency (not company-specific)
			const createdProductCurrency = await prisma.product_currency.create({
				data: {
					name: req.body.name,
					symbol: req.body.symbol,
					company_id: firstCompany ? firstCompany.id : 1,
					conversion: parseFloat(req.body.conversion),
					effective_from_date: req.body.effective_from_date ? new Date(req.body.effective_from_date) : null,
				},
			});
			res.json(createdProductCurrency);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	}
};

const getAllProductCurrency = async (req, res) => {
	if (req.query.query === "all") {
		try {
			// get all product_currency (not company-specific)
			const getAllProductCurrency = await prisma.product_currency.findMany({
				orderBy: {
					id: "asc",
				},
				include: {
					product: true,
					currency_rates: {
						orderBy: {
							effective_from_date: 'desc',
						},
						take: 1, // Get latest rate
					},
				},
			});
			// Update conversion field with latest rate if available
			const currenciesWithLatestRate = getAllProductCurrency.map(currency => {
				if (currency.currency_rates && currency.currency_rates.length > 0) {
					return {
						...currency,
						conversion: currency.currency_rates[0].conversion,
						effective_from_date: currency.currency_rates[0].effective_from_date,
					};
				}
				return currency;
			});
			res.json(currenciesWithLatestRate);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	} else {
		const { skip, limit } = getPagination(req.query);
		try {
			// get all product_currency paginated (not company-specific)
			const getAllProductCurrency = await prisma.product_currency.findMany({
				orderBy: {
					id: "asc",
				},
				include: {
					product: true,
					currency_rates: {
						orderBy: {
							effective_from_date: 'desc',
						},
						take: 1, // Get latest rate
					},
				},
				skip: parseInt(skip),
				take: parseInt(limit),
			});
			// Update conversion field with latest rate if available
			const currenciesWithLatestRate = getAllProductCurrency.map(currency => {
				if (currency.currency_rates && currency.currency_rates.length > 0) {
					return {
						...currency,
						conversion: currency.currency_rates[0].conversion,
						effective_from_date: currency.currency_rates[0].effective_from_date,
					};
				}
				return currency;
			});
			res.json(currenciesWithLatestRate);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	}
};

const getSingleProductCurrency = async (req, res) => {
	try {
		const singleProductCurrency = await prisma.product_currency.findUnique({
			where: {
				id: parseInt(req.params.id),
			},
			include: {
				product: true,
			},
		});

		if (!singleProductCurrency) {
			return res.status(404).json({ error: "Product currency not found" });
		}

		//adding image url to product_currency
		for (let product of singleProductCurrency.product) {
			if (product.imageName) {
				product.imageUrl = await getObjectSignedUrl(product.imageName);
			}
		}
		res.json(singleProductCurrency);
	} catch (error) {
		res.status(400).json(error.message);
		console.log(error.message);
	}
};

const updateSingleProductCurrency = async (req, res) => {
	try {
		const existingProductCurrency = await prisma.product_currency.findUnique({
			where: { id: parseInt(req.params.id) },
		});

		if (!existingProductCurrency) {
			return res.status(404).json({ error: "Product currency not found" });
		}

		const updateData = {
			name: req.body.name,
		};
		
		// Add optional fields if provided
		if (req.body.symbol !== undefined) {
			updateData.symbol = req.body.symbol;
		}
		if (req.body.conversion !== undefined) {
			updateData.conversion = parseFloat(req.body.conversion);
		}
		if (req.body.effective_from_date !== undefined) {
			updateData.effective_from_date = req.body.effective_from_date ? new Date(req.body.effective_from_date) : null;
		}
		
		const updatedProductCurrency = await prisma.product_currency.update({
			where: {
				id: parseInt(req.params.id),
			},
			data: updateData,
		});
		res.json(updatedProductCurrency);
	} catch (error) {
		res.status(400).json(error.message);
		console.log(error.message);
	}
};

const deleteSingleProductCurrency = async (req, res) => {
	try {
		const existingProductCurrency = await prisma.product_currency.findUnique({
			where: { id: parseInt(req.params.id) },
		});

		if (!existingProductCurrency) {
			return res.status(404).json({ error: "Product currency not found" });
		}

		const deletedProductCurrency = await prisma.product_currency.delete({
			where: {
				id: parseInt(req.params.id),
			},
		});
		res.json(deletedProductCurrency);
	} catch (error) {
		res.status(400).json(error.message);
		console.log(error.message);
	}
};

// Currency Rate Controllers
const getCurrencyRates = async (req, res) => {
	try {
		const currencyId = parseInt(req.params.id);
		
		const currency = await prisma.product_currency.findUnique({
			where: { id: currencyId },
		});

		if (!currency) {
			return res.status(404).json({ error: "Product currency not found" });
		}

		const rates = await prisma.product_currency_rate.findMany({
			where: {
				product_currency_id: currencyId,
			},
			orderBy: {
				effective_from_date: 'desc',
			},
		});
		res.json(rates);
	} catch (error) {
		res.status(400).json(error.message);
		console.log(error.message);
	}
};

const addCurrencyRate = async (req, res) => {
	try {
		const currencyId = parseInt(req.params.id);
		
		const currency = await prisma.product_currency.findUnique({
			where: { id: currencyId },
		});

		if (!currency) {
			return res.status(404).json({ error: "Product currency not found" });
		}

		const { conversion, effective_from_date } = req.body;
		
		// Create new rate
		const newRate = await prisma.product_currency_rate.create({
			data: {
				product_currency_id: currencyId,
				conversion: parseFloat(conversion),
				effective_from_date: new Date(effective_from_date),
			},
		});
		
		// Update the main currency conversion field to the latest rate
		await prisma.product_currency.update({
			where: { id: currencyId },
			data: {
				conversion: parseFloat(conversion),
				effective_from_date: new Date(effective_from_date),
			},
		});
		
		res.json(newRate);
	} catch (error) {
		res.status(400).json(error.message);
		console.log(error.message);
	}
};

const deleteCurrencyRate = async (req, res) => {
	try {
		const rateId = parseInt(req.params.rateId);
		
		// Get the rate
		const rate = await prisma.product_currency_rate.findUnique({
			where: { id: rateId },
		});

		if (!rate) {
			return res.status(404).json({ error: "Currency rate not found" });
		}

		const deletedRate = await prisma.product_currency_rate.delete({
			where: { id: rateId },
		});
		
		// Update main currency conversion to latest rate if available
		const currencyId = deletedRate.product_currency_id;
		const latestRate = await prisma.product_currency_rate.findFirst({
			where: { product_currency_id: currencyId },
			orderBy: { effective_from_date: 'desc' },
		});
		
		if (latestRate) {
			await prisma.product_currency.update({
				where: { id: currencyId },
				data: {
					conversion: latestRate.conversion,
					effective_from_date: latestRate.effective_from_date,
				},
			});
		}
		
		res.json(deletedRate);
	} catch (error) {
		res.status(400).json(error.message);
		console.log(error.message);
	}
};

module.exports = {
	createSingleProductCurrency,
	getAllProductCurrency,
	getSingleProductCurrency,
	updateSingleProductCurrency,
	deleteSingleProductCurrency,
	getCurrencyRates,
	addCurrencyRate,
	deleteCurrencyRate,
};

