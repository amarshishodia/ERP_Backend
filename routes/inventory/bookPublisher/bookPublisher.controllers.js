const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const prisma = require("../../../utils/prisma");
const { getObjectSignedUrl } = require("../../../utils/s3");

const createSingleBookPublisher = async (req, res) => {
	if (req.query.query === "deletemany") {
		try {
			// delete many book_publishers at once (not company-specific)
			const deletedBookPublishers = await prisma.book_publisher.deleteMany({
				where: {
					id: {
						in: req.body.map((id) => parseInt(id)),
					},
				},
			});
			res.json(deletedBookPublishers);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	} else if (req.query.query === "createmany") {
		try {
			const firstCompany = await prisma.appSetting.findFirst({
				select: { id: true },
			});
			const companyId = firstCompany ? firstCompany.id : 1;
			const upsert = req.query.upsert === "true";
			const rows = Array.isArray(req.body) ? req.body : [];

			if (upsert && rows.length > 0) {
				let created = 0;
				let updated = 0;
				for (const row of rows) {
					const name = String(row.name || "").trim();
					if (!name) continue;
					const address = row.address != null ? String(row.address).trim() || null : null;
					const phone = row.phone != null ? String(row.phone).trim() || null : null;
					const email = row.email != null ? String(row.email).trim() || null : null;
					const existing = await prisma.book_publisher.findUnique({
						where: {
							name_company_id: { name, company_id: companyId },
						},
					});
					if (existing) {
						await prisma.book_publisher.update({
							where: { id: existing.id },
							data: { address, phone, email },
						});
						updated += 1;
					} else {
						await prisma.book_publisher.create({
							data: { name, company_id: companyId, address, phone, email },
						});
						created += 1;
					}
				}
				res.json({ created, updated, message: `Created ${created}, updated ${updated}` });
			} else {
				const createdBookPublishers = await prisma.book_publisher.createMany({
					data: rows
						.filter((r) => String(r.name || "").trim())
						.map((r) => ({
							name: String(r.name).trim(),
							company_id: companyId,
							address: r.address != null ? String(r.address).trim() || null : null,
							phone: r.phone != null ? String(r.phone).trim() || null : null,
							email: r.email != null ? String(r.email).trim() || null : null,
						})),
					skipDuplicates: true,
				});
				res.json(createdBookPublishers);
			}
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	} else {
		try {
			const firstCompany = await prisma.appSetting.findFirst({
				select: { id: true },
			});
			const companyId = firstCompany ? firstCompany.id : 1;
			const existingProduct = await prisma.book_publisher.findFirst({
				where: {
					name: req.body.name,
					company_id: companyId,
				},
			});
			if (existingProduct) {
				return res.status(400).json({ message: 'Publisher already exist.' });
			}
			const createdBookPublisher = await prisma.book_publisher.create({
				data: {
					name: req.body.name,
					company_id: companyId,
					address: req.body.address != null && req.body.address !== '' ? req.body.address : null,
					phone: req.body.phone != null && req.body.phone !== '' ? req.body.phone : null,
					email: req.body.email != null && req.body.email !== '' ? req.body.email : null,
				},
			});
			res.json(createdBookPublisher);
		} catch (error) {
			console.log("error", error);
			res.status(400).json(error.message);
			console.log(error.message);
		}
	}
};

const getAllBookPublishers = async (req, res) => {
	if (req.query.query === "all") {
		try {
			// get all book_publishers (not company-specific)
			const getAllBookPublishers = await prisma.book_publisher.findMany({
				orderBy: {
					id: "asc",
				},
				include: {
					product: true,
				},
			});
			res.json(getAllBookPublishers);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	} else {
		const { skip, limit } = getPagination(req.query);
		try {
			const [data, total] = await Promise.all([
				prisma.book_publisher.findMany({
					orderBy: { id: "asc" },
					include: { product: true },
					skip: parseInt(skip),
					take: parseInt(limit),
				}),
				prisma.book_publisher.count(),
			]);
			res.json({ data, total });
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	}
};

const getSingleBookPublisher = async (req, res) => {
	try {
		const singleBookPublisher = await prisma.book_publisher.findUnique({
			where: {
				id: parseInt(req.params.id),
			},
			include: {
				product: true,
			},
		});

		if (!singleBookPublisher) {
			return res.status(404).json({ error: "Book publisher not found" });
		}

		//adding image url to book_publisher
		for (let product of singleBookPublisher.product) {
			if (product.imageName) {
				product.imageUrl = await getObjectSignedUrl(product.imageName);
			}
		}
		res.json(singleBookPublisher);
	} catch (error) {
		res.status(400).json(error.message);
		console.log(error.message);
	}
};

const updateSingleBookPublisher = async (req, res) => {
	try {
		const existingBookPublisher = await prisma.book_publisher.findUnique({
			where: { id: parseInt(req.params.id) },
		});

		if (!existingBookPublisher) {
			return res.status(404).json({ error: "Book publisher not found" });
		}

		const updateData = { name: req.body.name };
			if (req.body.address !== undefined) updateData.address = req.body.address === '' ? null : req.body.address;
			if (req.body.phone !== undefined) updateData.phone = req.body.phone === '' ? null : req.body.phone;
			if (req.body.email !== undefined) updateData.email = req.body.email === '' ? null : req.body.email;
			const updatedBookPublisher = await prisma.book_publisher.update({
				where: {
					id: parseInt(req.params.id),
				},
				data: updateData,
			});
		res.json(updatedBookPublisher);
	} catch (error) {
		res.status(400).json(error.message);
		console.log(error.message);
	}
};
	
	const deleteSingleBookPublisher = async (req, res) => {
	try {
		const existingBookPublisher = await prisma.book_publisher.findUnique({
			where: { id: parseInt(req.params.id) },
		});

		if (!existingBookPublisher) {
			return res.status(404).json({ error: "Book publisher not found" });
		}

		const deletedBookPublisher = await prisma.book_publisher.delete({
			where: {
				id: parseInt(req.params.id),
			},
		});
		res.json(deletedBookPublisher);
	} catch (error) {
		res.status(400).json(error.message);
		console.log(error.message);
	}
	};
	
	module.exports = {
	createSingleBookPublisher,
	getAllBookPublishers,
	getSingleBookPublisher,
	updateSingleBookPublisher,
	deleteSingleBookPublisher,
	};
	