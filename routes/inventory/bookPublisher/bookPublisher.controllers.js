const { getPagination } = require("../../../utils/query");
const { getCompanyId } = require("../../../utils/company");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
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
			// Get first company_id for publisher (publishers are shared, not company-specific)
			const firstCompany = await prisma.appSetting.findFirst({
				select: { id: true },
			});
			
			// create many book_publishers from an array of objects (not company-specific)
			const createdBookPublishers = await prisma.book_publisher.createMany({
				data: req.body.map((book_publisher) => {
					return {
						name: book_publisher.name,
						company_id: firstCompany ? firstCompany.id : 1,
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
			// Get first company_id for publisher (publishers are shared, not company-specific)
			const firstCompany = await prisma.appSetting.findFirst({
				select: { id: true },
			});
			
			// create single book_publisher (not company-specific)
			const existingProduct = await prisma.book_publisher.findFirst({
				where: {
					name: req.body.name,
				},
			});
		
			if (existingProduct) {
				return res.status(400).json({ message: 'Publisher already exist.' });
			}

			const createdBookPublisher = await prisma.book_publisher.create({
				data: {
					name: req.body.name,
					company_id: firstCompany ? firstCompany.id : 1,
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
			// get all book_publishers paginated (not company-specific)
			const getAllBookPublishers = await prisma.book_publisher.findMany({
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
	