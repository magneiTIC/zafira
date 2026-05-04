import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { Database } from './models';

const now = new Date().toISOString();

const initialDatabase: Database = {
  products: [
    {
      id: 'prod-riz-001',
      name: 'Riz premium 25 kg',
      sku: 'RIZ-25',
      category: 'Alimentaire',
      unit: 'sac',
      stockQuantity: 32,
      lowStockThreshold: 8,
      defaultPurchasePrice: 14500,
      defaultSalePrice: 17500,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-huile-001',
      name: 'Huile 5 L',
      sku: 'HUI-5L',
      category: 'Alimentaire',
      unit: 'bidon',
      stockQuantity: 18,
      lowStockThreshold: 6,
      defaultPurchasePrice: 4200,
      defaultSalePrice: 5200,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-sucre-001',
      name: 'Sucre 10 kg',
      sku: 'SUC-10',
      category: 'Alimentaire',
      unit: 'sac',
      stockQuantity: 9,
      lowStockThreshold: 10,
      defaultPurchasePrice: 6500,
      defaultSalePrice: 8000,
      createdAt: now,
      updatedAt: now,
    },
  ],
  customers: [
    {
      id: 'cust-001',
      name: 'Client comptoir',
      phone: '',
      email: '',
      createdAt: now,
    },
    {
      id: 'cust-002',
      name: 'Boutique Amina',
      phone: '+221 77 000 00 00',
      email: '',
      createdAt: now,
    },
  ],
  suppliers: [
    {
      id: 'sup-001',
      name: 'Fournisseur principal',
      phone: '+221 76 000 00 00',
      email: '',
      createdAt: now,
    },
  ],
  sales: [],
  supplierOrders: [],
  payments: [],
  stockMovements: [],
};

@Injectable()
export class StoreService {
  private readonly databasePath = join(process.cwd(), 'data', 'db.json');

  read(): Database {
    this.ensureDatabase();
    return JSON.parse(readFileSync(this.databasePath, 'utf-8')) as Database;
  }

  write(database: Database): Database {
    mkdirSync(dirname(this.databasePath), { recursive: true });
    writeFileSync(this.databasePath, JSON.stringify(database, null, 2));
    return database;
  }

  update(mutator: (database: Database) => void): Database {
    const database = this.read();
    mutator(database);
    return this.write(database);
  }

  private ensureDatabase() {
    if (!existsSync(this.databasePath)) {
      this.write(initialDatabase);
    }
  }
}
