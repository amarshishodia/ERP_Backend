const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const prisma = require("../../../utils/prisma");
const { getObjectSignedUrl } = require("../../../utils/s3");

const createSingleProductCurrency = async (req, res) => {
	const companyId = await getCompanyId(req.auth.sub);
	if (!companyId) {
		return res.status(400).json({ error: "User company_id not found" });
	}
	const companyIdNum = parseInt(companyId, 10);
	if (isNaN(companyIdNum) || companyIdNum <= 0) {
		return res.status(400).json({ error: "Invalid company_id" });
	}

	if (req.query.query === "deletemany") {
		try {
			const deletedProductCurrency = await prisma.product_currency.deleteMany({
				where: {
					id: { in: req.body.map((id) => parseInt(id)) },
					company_id: companyIdNum,
				},
			});
			res.json(deletedProductCurrency);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	} else if (req.query.query === "createmany") {
		try {
			const createdProductCurrency = await prisma.product_currency.createMany({
				data: req.body.map((product_currency) => ({
					name: product_currency.name,
					symbol: product_currency.symbol,
					company_id: companyIdNum,
				})),
				skipDuplicates: true,
			});
			res.json(createdProductCurrency);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	} else {
		try {
			const createdProductCurrency = await prisma.product_currency.create({
				data: {
					name: req.body.name,
					symbol: req.body.symbol,
					company_id: companyIdNum,
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
	const companyId = await getCompanyId(req.auth.sub);
	if (!companyId) {
		return res.status(400).json({ error: "User company_id not found" });
	}
	const companyIdNum = parseInt(companyId, 10);
	if (isNaN(companyIdNum) || companyIdNum <= 0) {
		return res.status(400).json({ error: "Invalid company_id" });
	}
	const whereByCompany = { company_id: companyIdNum };

	if (req.query.query === "all") {
		try {
			const getAllProductCurrency = await prisma.product_currency.findMany({
				where: whereByCompany,
				orderBy: { id: "asc" },
				include: {
					product: true,
					currency_rates: {
						orderBy: { effective_from_date: 'desc' },
						take: 1,
					},
				},
			});
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
			const getAllProductCurrency = await prisma.product_currency.findMany({
				where: whereByCompany,
				orderBy: { id: "asc" },
				include: {
					product: true,
					currency_rates: {
						orderBy: { effective_from_date: 'desc' },
						take: 1,
					},
				},
				skip: parseInt(skip),
				take: parseInt(limit),
			});
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
		const companyId = await getCompanyId(req.auth.sub);
		if (!companyId) {
			return res.status(400).json({ error: "User company_id not found" });
		}
		const companyIdNum = parseInt(companyId, 10);

		const singleProductCurrency = await prisma.product_currency.findUnique({
			where: { id: parseInt(req.params.id) },
			include: { product: true },
		});

		if (!singleProductCurrency) {
			return res.status(404).json({ error: "Product currency not found" });
		}
		if (singleProductCurrency.company_id !== companyIdNum) {
			return res.status(403).json({ error: "Product currency does not belong to your company" });
		}

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
		const companyId = await getCompanyId(req.auth.sub);
		if (!companyId) {
			return res.status(400).json({ error: "User company_id not found" });
		}
		const companyIdNum = parseInt(companyId, 10);

		const existingProductCurrency = await prisma.product_currency.findUnique({
			where: { id: parseInt(req.params.id) },
			select: { id: true, company_id: true },
		});

		if (!existingProductCurrency) {
			return res.status(404).json({ error: "Product currency not found" });
		}
		if (existingProductCurrency.company_id !== companyIdNum) {
			return res.status(403).json({ error: "Product currency does not belong to your company" });
		}

		const updateData = { name: req.body.name };
		if (req.body.symbol !== undefined) updateData.symbol = req.body.symbol;
		if (req.body.conversion !== undefined) updateData.conversion = parseFloat(req.body.conversion);
		if (req.body.effective_from_date !== undefined) {
			updateData.effective_from_date = req.body.effective_from_date ? new Date(req.body.effective_from_date) : null;
		}

		const updatedProductCurrency = await prisma.product_currency.update({
			where: { id: parseInt(req.params.id) },
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
		const companyId = await getCompanyId(req.auth.sub);
		if (!companyId) {
			return res.status(400).json({ error: "User company_id not found" });
		}
		const companyIdNum = parseInt(companyId, 10);

		const existingProductCurrency = await prisma.product_currency.findUnique({
			where: { id: parseInt(req.params.id) },
			select: { id: true, company_id: true },
		});

		if (!existingProductCurrency) {
			return res.status(404).json({ error: "Product currency not found" });
		}
		if (existingProductCurrency.company_id !== companyIdNum) {
			return res.status(403).json({ error: "Product currency does not belong to your company" });
		}

		const deletedProductCurrency = await prisma.product_currency.delete({
			where: { id: parseInt(req.params.id) },
		});
		res.json(deletedProductCurrency);
	} catch (error) {
		res.status(400).json(error.message);
		console.log(error.message);
	}
};

// Currency Rate Controllers (scoped by company)
const getCurrencyRates = async (req, res) => {
	try {
		const companyId = await getCompanyId(req.auth.sub);
		if (!companyId) return res.status(400).json({ error: "User company_id not found" });
		const companyIdNum = parseInt(companyId, 10);

		const currencyId = parseInt(req.params.id);
		const currency = await prisma.product_currency.findUnique({
			where: { id: currencyId },
			select: { id: true, company_id: true },
		});
		if (!currency) return res.status(404).json({ error: "Product currency not found" });
		if (currency.company_id !== companyIdNum) {
			return res.status(403).json({ error: "Product currency does not belong to your company" });
		}

		const rates = await prisma.product_currency_rate.findMany({
			where: { product_currency_id: currencyId },
			orderBy: { effective_from_date: 'desc' },
		});
		res.json(rates);
	} catch (error) {
		res.status(400).json(error.message);
		console.log(error.message);
	}
};

const addCurrencyRate = async (req, res) => {
	try {
		const companyId = await getCompanyId(req.auth.sub);
		if (!companyId) return res.status(400).json({ error: "User company_id not found" });
		const companyIdNum = parseInt(companyId, 10);

		const currencyId = parseInt(req.params.id);
		const currency = await prisma.product_currency.findUnique({
			where: { id: currencyId },
			select: { id: true, company_id: true },
		});
		if (!currency) return res.status(404).json({ error: "Product currency not found" });
		if (currency.company_id !== companyIdNum) {
			return res.status(403).json({ error: "Product currency does not belong to your company" });
		}

		const { conversion, effective_from_date } = req.body;
		const newRate = await prisma.product_currency_rate.create({
			data: {
				product_currency_id: currencyId,
				conversion: parseFloat(conversion),
				effective_from_date: new Date(effective_from_date),
			},
		});
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
		const companyId = await getCompanyId(req.auth.sub);
		if (!companyId) return res.status(400).json({ error: "User company_id not found" });
		const companyIdNum = parseInt(companyId, 10);

		const rateId = parseInt(req.params.rateId);
		const rate = await prisma.product_currency_rate.findUnique({
			where: { id: rateId },
			include: { product_currency: { select: { company_id: true } } },
		});
		if (!rate) return res.status(404).json({ error: "Currency rate not found" });
		if (rate.product_currency.company_id !== companyIdNum) {
			return res.status(403).json({ error: "Product currency does not belong to your company" });
		}

		const deletedRate = await prisma.product_currency_rate.delete({
			where: { id: rateId },
		});
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

