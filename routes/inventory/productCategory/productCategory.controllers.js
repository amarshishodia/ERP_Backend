const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { getObjectSignedUrl } = require("../../../utils/s3");

const createSingleProductCategory = async (req, res) => {
	// Get company_id from logged-in user
	const companyId = await getCompanyId(req.auth.sub);
	if (!companyId) {
		return res.status(400).json({ error: "User company_id not found" });
	}

	if (req.query.query === "deletemany") {
		try {
			// delete many product_category at once (only for user's company)
			const deletedProductCategory = await prisma.product_category.deleteMany({
				where: {
					id: {
						in: req.body.map((id) => parseInt(id)),
					},
					company_id: companyId,
				},
			});
			res.json(deletedProductCategory);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	} else if (req.query.query === "createmany") {
		try {
			const upsert = req.query.upsert === "true";
			const rows = Array.isArray(req.body) ? req.body : [];

			if (upsert && rows.length > 0) {
				let created = 0;
				let updated = 0;
				for (const row of rows) {
					const name = String(row.name || "").trim();
					if (!name) continue;
					const existing = await prisma.product_category.findUnique({
						where: {
							name_company_id: { name, company_id: companyId },
						},
					});
					if (existing) {
						updated += 1;
					} else {
						await prisma.product_category.create({
							data: { name, company_id: companyId },
						});
						created += 1;
					}
				}
				res.json({ created, updated, message: `Created ${created}, updated ${updated}` });
			} else {
				const createdProductCategory = await prisma.product_category.createMany({
					data: rows
						.filter((r) => String(r.name || "").trim())
						.map((r) => ({
							name: String(r.name).trim(),
							company_id: companyId,
						})),
					skipDuplicates: true,
				});
				res.json(createdProductCategory);
			}
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	} else {
		try {
			// create single product_category from an object with company_id
			const createdProductCategory = await prisma.product_category.create({
				data: {
					name: req.body.name,
					company_id: companyId,
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
	// Get company_id from logged-in user
	const companyId = await getCompanyId(req.auth.sub);
	if (!companyId) {
		return res.status(400).json({ error: "User company_id not found" });
	}

	if (req.query.query === "all") {
		try {
			// get all product_category for user's company
			const getAllProductCategory = await prisma.product_category.findMany({
				where: {
					company_id: companyId,
				},
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
			// get all product_category paginated for user's company
			const getAllProductCategory = await prisma.product_category.findMany({
				where: {
					company_id: companyId,
				},
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
		// Get company_id from logged-in user
		const companyId = await getCompanyId(req.auth.sub);
		if (!companyId) {
			return res.status(400).json({ error: "User company_id not found" });
		}

		const singleProductCategory = await prisma.product_category.findUnique({
			where: {
				id: parseInt(req.params.id),
			},
			include: {
				product: true,
			},
		});

		if (!singleProductCategory) {
			return res.status(404).json({ error: "Product category not found" });
		}

		// Verify that the product category belongs to the user's company
		if (singleProductCategory.company_id !== companyId) {
			return res.status(403).json({ error: "Product category does not belong to your company" });
		}

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
		// Get company_id from logged-in user
		const companyId = await getCompanyId(req.auth.sub);
		if (!companyId) {
			return res.status(400).json({ error: "User company_id not found" });
		}

		// Verify that the product category belongs to the user's company
		const existingProductCategory = await prisma.product_category.findUnique({
			where: { id: parseInt(req.params.id) },
			select: { company_id: true },
		});

		if (!existingProductCategory) {
			return res.status(404).json({ error: "Product category not found" });
		}

		if (existingProductCategory.company_id !== companyId) {
			return res.status(403).json({ error: "Product category does not belong to your company" });
		}

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
		// Get company_id from logged-in user
		const companyId = await getCompanyId(req.auth.sub);
		if (!companyId) {
			return res.status(400).json({ error: "User company_id not found" });
		}

		// Verify that the product category belongs to the user's company
		const existingProductCategory = await prisma.product_category.findUnique({
			where: { id: parseInt(req.params.id) },
			select: { company_id: true },
		});

		if (!existingProductCategory) {
			return res.status(404).json({ error: "Product category not found" });
		}

		if (existingProductCategory.company_id !== companyId) {
			return res.status(403).json({ error: "Product category does not belong to your company" });
		}

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
