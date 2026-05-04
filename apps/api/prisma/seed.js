const { PrismaClient } = require('@prisma/client');
const { scryptSync, randomBytes } = require('crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  await prisma.user.upsert({
    where: { email: 'admin@zafira.local' },
    update: {
      name: 'Administrateur',
      passwordHash: hashPassword('Admin1234'),
      role: 'admin',
    },
    create: {
      name: 'Administrateur',
      email: 'admin@zafira.local',
      passwordHash: hashPassword('Admin1234'),
      role: 'admin',
    },
  });

  await prisma.customer.upsert({
    where: { id: 'cust-001' },
    update: {},
    create: {
      id: 'cust-001',
      name: 'Client comptoir',
    },
  });

  await prisma.customer.upsert({
    where: { id: 'cust-002' },
    update: {},
    create: {
      id: 'cust-002',
      name: 'Boutique Amina',
      phone: '+221 77 000 00 00',
    },
  });

  await prisma.supplier.upsert({
    where: { id: 'sup-001' },
    update: {},
    create: {
      id: 'sup-001',
      name: 'Fournisseur principal',
      phone: '+221 76 000 00 00',
    },
  });

  await prisma.product.upsert({
    where: { id: 'prod-bracelet-001' },
    update: {},
    create: {
      id: 'prod-bracelet-001',
      name: 'Bracelet classique',
      sku: 'BIJ-BRA-001',
      category: 'Bijoux',
      unit: 'piece',
      stockQuantity: 12,
      lowStockThreshold: 2,
      defaultPurchasePrice: 1000,
      defaultSalePrice: 2500,
    },
  });

  await prisma.product.upsert({
    where: { id: 'prod-chaussure-001' },
    update: {},
    create: {
      id: 'prod-chaussure-001',
      name: 'Chaussure femme',
      sku: 'CHA-FEM-001',
      category: 'Chaussure',
      unit: 'paire',
      stockQuantity: 6,
      lowStockThreshold: 2,
      defaultPurchasePrice: 8500,
      defaultSalePrice: 14000,
    },
  });

  await prisma.product.upsert({
    where: { id: 'prod-sac-001' },
    update: {},
    create: {
      id: 'prod-sac-001',
      name: 'Sac a main',
      sku: 'SAC-001',
      category: 'Sac',
      unit: 'piece',
      stockQuantity: 5,
      lowStockThreshold: 2,
      defaultPurchasePrice: 6500,
      defaultSalePrice: 12000,
    },
  });

  await prisma.product.upsert({
    where: { id: 'prod-voile-001' },
    update: {},
    create: {
      id: 'prod-voile-001',
      name: 'Voile premium',
      sku: 'VOI-001',
      category: 'Voile',
      unit: 'piece',
      stockQuantity: 10,
      lowStockThreshold: 2,
      defaultPurchasePrice: 2500,
      defaultSalePrice: 5000,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
