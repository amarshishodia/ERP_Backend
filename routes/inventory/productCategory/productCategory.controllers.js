const { getPagination } = require("../../../utils/query");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { getObjectSignedUrl } = require("../../../utils/s3");

const createSingleProductCategory = async (req, res) => {
	if (req.query.query === "deletemany") {
		try {
			// delete many product_category at once
			const deletedProductCategory = await prisma.product_category.deleteMany({
				where: {
					id: {
						in: req.body.map((id) => parseInt(id)),
					},
				},
			});
			res.json(deletedProductCategory);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	} else if (req.query.query === "createmany") {
		try {
			// create many product_category from an array of objects
			const createdProductCategory = await prisma.product_category.createMany({
				data: req.body.map((product_category) => {
					return {
						name: product_category.name,
					};
				}),
				skipDuplicates: true,
			});
			res.json(createdProductCategory);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	} else {
		try {
			// create single product_category from an object
			const createdProductCategory = await prisma.product_category.create({
				data: {
					name: req.body.name,
				},
			});
			res.json(createdProductCategory);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	}
};

const getAllProductCategory = async (req, res) => {
	if (req.query.query === "all") {
		try {
			// get all product_category
			const getAllProductCategory = await prisma.product_category.findMany({
				orderBy: {
					id: "asc",
				},
				include: {
					product: true,
				},
			});
			res.json(getAllProductCategory);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	} else {
		const { skip, limit } = getPagination(req.query);
		try {
			// get all product_category paginated
			const getAllProductCategory = await prisma.product_category.findMany({
				orderBy: {
					id: "asc",
				},
				include: {
					product: true,
				},
				skip: parseInt(skip),
				take: parseInt(limit),
			});
			res.json(getAllProductCategory);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	}
};

const getSingleProductCategory = async (req, res) => {
	try {
		const singleProductCategory = await prisma.product_category.findUnique({
			where: {
				id: parseInt(req.params.id),
			},
			include: {
				product: true,
			},
		});
		//adding image url to product_category
		// for (let product of singleProductCategory.product) {
		// 	if (product.imageName) {
		// 		product.imageUrl = await getObjectSignedUrl(product.imageName);
		// 	}
		// }
		res.json(singleProductCategory);
	} catch (error) {
		res.status(400).json(error.message);
		console.log(error.message);
	}
};

const updateSingleProductCategory = async (req, res) => {
	try {
		const updatedProductCategory = await prisma.product_category.update({
			where: {
				id: parseInt(req.params.id),
			},
			data: {
				name: req.body.name,
			},
		});
		res.json(updatedProductCategory);
	} catch (error) {
		res.status(400).json(error.message);
		console.log(error.message);
	}
};

const deleteSingleProductCategory = async (req, res) => {
	try {
		const deletedProductCategory = await prisma.product_category.delete({
			where: {
				id: parseInt(req.params.id),
			},
		});
		res.json(deletedProductCategory);
	} catch (error) {
		res.status(400).json(error.message);
		console.log(error.message);
	}
};

module.exports = {
	createSingleProductCategory,
	getAllProductCategory,
	getSingleProductCategory,
	updateSingleProductCategory,
	deleteSingleProductCategory,
};
