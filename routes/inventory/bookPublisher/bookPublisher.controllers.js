const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { getObjectSignedUrl } = require("../../../utils/s3");

const createSingleBookPublisher = async (req, res) => {
	// Get company_id from logged-in user
	const companyId = await getCompanyId(req.auth.sub);
	if (!companyId) {
		return res.status(400).json({ error: "User company_id not found" });
	}

	if (req.query.query === "deletemany") {
		try {
			// delete many book_publishers at once (only for user's company)
			const deletedBookPublishers = await prisma.book_publisher.deleteMany({
				where: {
					id: {
						in: req.body.map((id) => parseInt(id)),
					},
					company_id: companyId,
				},
			});
			res.json(deletedBookPublishers);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	} else if (req.query.query === "createmany") {
		try {
			// create many book_publishers from an array of objects with company_id
			const createdBookPublishers = await prisma.book_publisher.createMany({
				data: req.body.map((book_publisher) => {
					return {
						name: book_publisher.name,
						company_id: companyId,
					};
				}),
				skipDuplicates: true,
			});
			res.json(createdBookPublishers);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	} else {
		try {
			// create single book_publisher from an object with company_id
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
				}
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
	// Get company_id from logged-in user
	const companyId = await getCompanyId(req.auth.sub);
	if (!companyId) {
		return res.status(400).json({ error: "User company_id not found" });
	}

	if (req.query.query === "all") {
		try {
			// get all book_publishers for user's company
			const getAllBookPublishers = await prisma.book_publisher.findMany({
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
			res.json(getAllBookPublishers);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	} else {
		const { skip, limit } = getPagination(req.query);
		try {
			// get all book_publishers paginated for user's company
			const getAllBookPublishers = await prisma.book_publisher.findMany({
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
			res.json(getAllBookPublishers);
		} catch (error) {
			res.status(400).json(error.message);
			console.log(error.message);
		}
	}
};

const getSingleBookPublisher = async (req, res) => {
	try {
		// Get company_id from logged-in user
		const companyId = await getCompanyId(req.auth.sub);
		if (!companyId) {
			return res.status(400).json({ error: "User company_id not found" });
		}

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

		// Verify that the book publisher belongs to the user's company
		if (singleBookPublisher.company_id !== companyId) {
			return res.status(403).json({ error: "Book publisher does not belong to your company" });
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
		// Get company_id from logged-in user
		const companyId = await getCompanyId(req.auth.sub);
		if (!companyId) {
			return res.status(400).json({ error: "User company_id not found" });
		}

		// Verify that the book publisher belongs to the user's company
		const existingBookPublisher = await prisma.book_publisher.findUnique({
			where: { id: parseInt(req.params.id) },
			select: { company_id: true },
		});

		if (!existingBookPublisher) {
			return res.status(404).json({ error: "Book publisher not found" });
		}

		if (existingBookPublisher.company_id !== companyId) {
			return res.status(403).json({ error: "Book publisher does not belong to your company" });
		}

		const updatedBookPublisher = await prisma.book_publisher.update({
			where: {
				id: parseInt(req.params.id),
			},
			data: {
				name: req.body.name,
				url: req.body.url,
			},
		});
		res.json(updatedBookPublisher);
	} catch (error) {
		res.status(400).json(error.message);
		console.log(error.message);
	}
};
	
	const deleteSingleBookPublisher = async (req, res) => {
	try {
		// Get company_id from logged-in user
		const companyId = await getCompanyId(req.auth.sub);
		if (!companyId) {
			return res.status(400).json({ error: "User company_id not found" });
		}

		// Verify that the book publisher belongs to the user's company
		const existingBookPublisher = await prisma.book_publisher.findUnique({
			where: { id: parseInt(req.params.id) },
			select: { company_id: true },
		});

		if (!existingBookPublisher) {
			return res.status(404).json({ error: "Book publisher not found" });
		}

		if (existingBookPublisher.company_id !== companyId) {
			return res.status(403).json({ error: "Book publisher does not belong to your company" });
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
	