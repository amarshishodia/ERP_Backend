const { getPagination } = require("../../../utils/query");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { getObjectSignedUrl } = require("../../../utils/s3");

const createSingleProductCurrency = async (req, res) => {
	if (req.query.query === "deletemany") {
		try {
			// delete many product_currency at once
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
			// create many product_currency from an array of objects
			const createdProductCurrency = await prisma.product_currency.createMany({
				data: req.body.map((product_currency) => {
					return {
						name: product_currency.name,
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
			// create single product_currency from an object
			const createdProductCurrency = await prisma.product_currency.create({
				data: {
					name: req.body.name,
					symbol: req.body.symbol,
					conversion: parseFloat(req.body.conversion),
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
			// get all product_currency
			const getAllProductCurrency = await prisma.product_currency.findMany({
				orderBy: {
					id: "asc",
				},
				include: {
					product: true,
				},
			});
			res.json(getAllProductCurrency);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	} else {
		const { skip, limit } = getPagination(req.query);
		try {
			// get all product_currency paginated
			const getAllProductCurrency = await prisma.product_currency.findMany({
				orderBy: {
					id: "asc",
				},
				include: {
					product: true,
				},
				skip: parseInt(skip),
				take: parseInt(limit),
			});
			res.json(getAllProductCurrency);
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
		const updatedProductCurrency = await prisma.product_currency.update({
			where: {
				id: parseInt(req.params.id),
			},
			data: {
				name: req.body.name,
			},
		});
		res.json(updatedProductCurrency);
	} catch (error) {
		res.status(400).json(error.message);
		console.log(error.message);
	}
};

const deleteSingleProductCurrency = async (req, res) => {
	try {
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

module.exports = {
	createSingleProductCurrency,
	getAllProductCurrency,
	getSingleProductCurrency,
	updateSingleProductCurrency,
	deleteSingleProductCurrency,
};

