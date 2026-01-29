const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const readline = require("readline");

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function createSuperAdmin() {
  try {
    console.log("=== Super Admin User Creation ===\n");

    const username = await question("Enter username: ");
    if (!username) {
      console.error("Username is required!");
      process.exit(1);
    }

    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      console.error(`User with username "${username}" already exists!`);
      process.exit(1);
    }

    const email = await question("Enter email (optional): ");
    const password = await question("Enter password: ");
    if (!password) {
      console.error("Password is required!");
      process.exit(1);
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Create super admin user
    const user = await prisma.user.create({
      data: {
        username,
        password: hash,
        email: email || null,
        role: "superAdmin",
        is_super_admin: true,
        status: true,
      },
    });

    console.log("\n✅ Super admin created successfully!");
    console.log(`Username: ${user.username}`);
    console.log(`Email: ${user.email || "N/A"}`);
    console.log(`ID: ${user.id}`);
    console.log(`Super Admin: ${user.is_super_admin}`);
  } catch (error) {
    console.error("Error creating super admin:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    rl.close();
  }
}

createSuperAdmin();
