const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testDatabaseConnection() {
  try {
    // This is a simple query to check if the database connection is successful
    const result = await prisma.$queryRaw`SELECT 1 as result`;

    // If the query is successful, log a message
    console.log('Database connection is successful:', result);
  } catch (error) {
    // If there is an error, log the error message
    console.error('Error connecting to the database:', error);
  } finally {
    // Close the Prisma client to release resources
    await prisma.$disconnect();
  }
}

// Call the function to test the database connection
testDatabaseConnection();
