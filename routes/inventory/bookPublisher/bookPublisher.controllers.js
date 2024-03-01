const { getPagination } = require("../../../utils/query");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { getObjectSignedUrl } = require("../../../utils/s3");

const createSingleBookPublisher = async (req, res) => {
	if (req.query.query === "deletemany") {
		try {
			// delete many book_publishers at once
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
			// create many book_publishers from an array of objects
			const createdBookPublishers = await prisma.book_publisher.createMany({
				data: req.body.map((book_publisher) => {
					return {
						name: book_publisher.name,
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
			// create single book_publisher from an object

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
					name: req.body.name
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
			// get all book_publishers
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
			// get all book_publishers paginated
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
	