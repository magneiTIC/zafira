import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AdjustStockDto,
  CreateCustomerDto,
  CreatePaymentDto,
  CreateProductDto,
  CreateSaleDto,
  CreateSupplierDto,
  CreateSupplierOrderDto,
  Customer,
  Database,
  DiscountType,
  Product,
  Sale,
  StockMovement,
  Supplier,
  SupplierOrder,
} from './models';
import { PrismaService } from './prisma.service';

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const toNumber = (value: unknown, fallback = 0) => roundMoney(Number(value ?? fallback));
const today = () => new Date().toISOString().slice(0, 10);
const toIso = (value: Date | string) => (value instanceof Date ? value.toISOString() : value);
const toDateInput = (value?: string) => new Date(`${value || today()}T00:00:00.000Z`);
const toDayString = (value: Date | string) => toIso(value).slice(0, 10);

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll() {
    const database = await this.readDatabase();
    return {
      products: database.products,
      customers: this.withCustomerDebt(database),
      suppliers: database.suppliers,
      sales: database.sales,
      supplierOrders: database.supplierOrders,
      payments: database.payments,
      stockMovements: database.stockMovements,
      summary: this.buildSummary(database),
    };
  }

  async getProducts() {
    const products = await this.prisma.product.findMany({ orderBy: { name: 'asc' } });
    return products.map((product) => this.mapProduct(product));
  }

  async createProduct(dto: CreateProductDto) {
    this.requireText(dto.name, 'Le nom du produit est obligatoire.');
    const stockQuantity = toNumber(dto.stockQuantity);

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: dto.name.trim(),
          sku: dto.sku?.trim() || '',
          category: dto.category?.trim() || 'General',
          unit: dto.unit?.trim() || 'piece',
          stockQuantity,
          lowStockThreshold: toNumber(dto.lowStockThreshold, 2),
          defaultPurchasePrice: toNumber(dto.defaultPurchasePrice),
          defaultSalePrice: toNumber(dto.defaultSalePrice),
        },
      });

      if (stockQuantity !== 0) {
        await tx.stockMovement.create({
          data: this.stockMovementData(created, 'adjustment', stockQuantity, created.defaultPurchasePrice, 'Stock initial'),
        });
      }

      return created;
    });

    return this.mapProduct(product);
  }

  async updateProduct(productId: string, dto: Partial<CreateProductDto>) {
    const product = await this.prisma.$transaction(async (tx) => {
      const current = await tx.product.findUnique({ where: { id: productId } });
      if (!current) {
        throw new NotFoundException('Produit introuvable.');
      }

      const nextStock = dto.stockQuantity === undefined ? current.stockQuantity : toNumber(dto.stockQuantity);
      const updated = await tx.product.update({
        where: { id: productId },
        data: {
          name: dto.name?.trim() || current.name,
          sku: dto.sku?.trim() ?? current.sku,
          category: dto.category?.trim() || current.category,
          unit: dto.unit?.trim() || current.unit,
          stockQuantity: nextStock,
          lowStockThreshold: dto.lowStockThreshold === undefined ? current.lowStockThreshold : toNumber(dto.lowStockThreshold),
          defaultPurchasePrice: dto.defaultPurchasePrice === undefined ? current.defaultPurchasePrice : toNumber(dto.defaultPurchasePrice),
          defaultSalePrice: dto.defaultSalePrice === undefined ? current.defaultSalePrice : toNumber(dto.defaultSalePrice),
        },
      });

      const change = roundMoney(updated.stockQuantity - current.stockQuantity);
      if (change !== 0) {
        await tx.stockMovement.create({
          data: this.stockMovementData(updated, 'adjustment', change, updated.defaultPurchasePrice, 'Correction de stock'),
        });
      }

      return updated;
    });

    return this.mapProduct(product);
  }

  async adjustStock(productId: string, dto: AdjustStockDto) {
    const quantityChange = toNumber(dto.quantityChange);
    const product = await this.prisma.$transaction(async (tx) => {
      const current = await tx.product.findUnique({ where: { id: productId } });
      if (!current) {
        throw new NotFoundException('Produit introuvable.');
      }

      const updated = await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: roundMoney(current.stockQuantity + quantityChange) },
      });

      await tx.stockMovement.create({
        data: this.stockMovementData(
          updated,
          'adjustment',
          quantityChange,
          toNumber(dto.unitCost, updated.defaultPurchasePrice),
          dto.note || 'Ajustement manuel',
        ),
      });

      return updated;
    });

    return this.mapProduct(product);
  }

  async getCustomers() {
    const database = await this.readDatabase();
    return this.withCustomerDebt(database);
  }

  async createCustomer(dto: CreateCustomerDto) {
    this.requireText(dto.name, 'Le nom du client est obligatoire.');
    const customer = await this.prisma.customer.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone?.trim() || '',
        email: dto.email?.trim() || '',
      },
    });
    return this.mapCustomer(customer);
  }

  async getSuppliers() {
    const suppliers = await this.prisma.supplier.findMany({ orderBy: { name: 'asc' } });
    return suppliers.map((supplier) => this.mapSupplier(supplier));
  }

  async createSupplier(dto: CreateSupplierDto) {
    this.requireText(dto.name, 'Le nom du fournisseur est obligatoire.');
    const supplier = await this.prisma.supplier.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone?.trim() || '',
        email: dto.email?.trim() || '',
      },
    });
    return this.mapSupplier(supplier);
  }

  async getSales() {
    const sales = await this.prisma.sale.findMany({
      include: { items: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return sales.map((sale) => this.mapSale(sale));
  }

  async createSale(dto: CreateSaleDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('La vente doit contenir au moins un produit.');
    }

    const sale = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: dto.customerId } });
      if (!customer) {
        throw new NotFoundException('Client introuvable.');
      }

      const saleItems = [];
      for (const item of dto.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) {
          throw new NotFoundException('Produit introuvable.');
        }

        const quantity = toNumber(item.quantity);
        if (quantity <= 0) {
          throw new BadRequestException(`La quantite de ${product.name} doit etre positive.`);
        }
        if (product.stockQuantity < quantity) {
          throw new BadRequestException(`Stock insuffisant pour ${product.name}. Disponible: ${product.stockQuantity}.`);
        }

        const unitPrice = toNumber(item.unitPrice, product.defaultSalePrice);
        const discountType: DiscountType = item.discountType || 'amount';
        const discountValue = toNumber(item.discountValue);
        const lineSubtotal = roundMoney(quantity * unitPrice);
        const discountAmount = this.calculateDiscount(lineSubtotal, discountType, discountValue);
        const lineTotal = roundMoney(Math.max(0, lineSubtotal - discountAmount));
        const lineCost = roundMoney(quantity * product.defaultPurchasePrice);

        await tx.product.update({
          where: { id: product.id },
          data: { stockQuantity: roundMoney(product.stockQuantity - quantity) },
        });

        saleItems.push({
          productId: product.id,
          productName: product.name,
          quantity,
          unitPrice,
          discountType,
          discountValue,
          unitCostSnapshot: product.defaultPurchasePrice,
          lineSubtotal,
          discountAmount,
          lineTotal,
          lineCost,
          lineProfit: roundMoney(lineTotal - lineCost),
        });
      }

      const subtotal = roundMoney(saleItems.reduce((sum, item) => sum + item.lineSubtotal, 0));
      const discountTotal = roundMoney(saleItems.reduce((sum, item) => sum + item.discountAmount, 0));
      const totalAmount = roundMoney(saleItems.reduce((sum, item) => sum + item.lineTotal, 0));
      const costTotal = roundMoney(saleItems.reduce((sum, item) => sum + item.lineCost, 0));
      const amountReceived = Math.min(toNumber(dto.amountReceived), totalAmount);

      const created = await tx.sale.create({
        data: {
          customerId: customer.id,
          customerName: customer.name,
          date: toDateInput(dto.date),
          subtotal,
          discountTotal,
          totalAmount,
          costTotal,
          amountReceived,
          balanceDue: roundMoney(totalAmount - amountReceived),
          profit: roundMoney(totalAmount - costTotal),
          items: { create: saleItems },
        },
        include: { items: true },
      });

      if (amountReceived > 0) {
        await tx.payment.create({
          data: {
            saleId: created.id,
            customerId: customer.id,
            customerName: customer.name,
            date: created.date,
            amount: amountReceived,
            note: 'Avance ou paiement initial',
          },
        });
      }

      await tx.stockMovement.createMany({
        data: saleItems.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          type: 'sale',
          quantityChange: -item.quantity,
          unitCost: item.unitCostSnapshot,
          reference: `Vente ${created.id}`,
          date: created.date,
        })),
      });

      return created;
    });

    return this.mapSale(sale);
  }

  async addPayment(saleId: string, dto: CreatePaymentDto) {
    const amount = toNumber(dto.amount);
    if (amount <= 0) {
      throw new BadRequestException('Le montant du paiement doit etre positif.');
    }

    const sale = await this.prisma.$transaction(async (tx) => {
      const current = await tx.sale.findUnique({ where: { id: saleId } });
      if (!current) {
        throw new NotFoundException('Vente introuvable.');
      }

      const acceptedAmount = Math.min(amount, current.balanceDue);
      if (acceptedAmount <= 0) {
        throw new BadRequestException('Cette vente est deja soldee.');
      }

      const updated = await tx.sale.update({
        where: { id: saleId },
        data: {
          amountReceived: roundMoney(current.amountReceived + acceptedAmount),
          balanceDue: roundMoney(current.totalAmount - current.amountReceived - acceptedAmount),
        },
        include: { items: true },
      });

      await tx.payment.create({
        data: {
          saleId: updated.id,
          customerId: updated.customerId,
          customerName: updated.customerName,
          date: toDateInput(dto.date),
          amount: acceptedAmount,
          note: dto.note?.trim() || 'Reglement client',
        },
      });

      return updated;
    });

    return this.mapSale(sale);
  }

  async getSupplierOrders() {
    const orders = await this.prisma.supplierOrder.findMany({
      include: { items: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return orders.map((order) => this.mapSupplierOrder(order));
  }

  async createSupplierOrder(dto: CreateSupplierOrderDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('La commande fournisseur doit contenir au moins un produit.');
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!supplier) {
        throw new NotFoundException('Fournisseur introuvable.');
      }

      const orderItems = [];
      for (const item of dto.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) {
          throw new NotFoundException('Produit introuvable.');
        }

        const quantity = toNumber(item.quantity);
        if (quantity <= 0) {
          throw new BadRequestException(`La quantite de ${product.name} doit etre positive.`);
        }

        const unitCost = toNumber(item.unitCost, product.defaultPurchasePrice);
        orderItems.push({
          productId: product.id,
          productName: product.name,
          quantity,
          unitCost,
          lineTotal: roundMoney(quantity * unitCost),
        });
      }

      const deliveryFee = toNumber(dto.deliveryFee);
      if (deliveryFee < 0) {
        throw new BadRequestException('Le montant de livraison ne peut pas etre negatif.');
      }

      const productsTotal = roundMoney(orderItems.reduce((sum, item) => sum + item.lineTotal, 0));
      const totalAmount = roundMoney(productsTotal + deliveryFee);
      const amountPaid = Math.min(toNumber(dto.amountPaid), totalAmount);
      const status = dto.status || 'received';
      const created = await tx.supplierOrder.create({
        data: {
          supplierId: supplier.id,
          supplierName: supplier.name,
          date: toDateInput(dto.date),
          status,
          deliveryFee,
          totalAmount,
          amountPaid,
          balanceDue: roundMoney(totalAmount - amountPaid),
          items: { create: orderItems },
        },
        include: { items: true },
      });

      if (status === 'received') {
        for (const item of orderItems) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) {
            throw new NotFoundException('Produit introuvable.');
          }
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: roundMoney(product.stockQuantity + item.quantity),
              defaultPurchasePrice: this.weightedAverageCost(product.stockQuantity, product.defaultPurchasePrice, item.quantity, item.unitCost),
            },
          });
        }

        await tx.stockMovement.createMany({
          data: orderItems.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            type: 'purchase',
            quantityChange: item.quantity,
            unitCost: item.unitCost,
            reference: `Commande fournisseur ${created.id}`,
            date: created.date,
          })),
        });
      }

      return created;
    });

    return this.mapSupplierOrder(order);
  }

  async getSummary() {
    return this.buildSummary(await this.readDatabase());
  }

  private async readDatabase(): Promise<Database> {
    const [products, customers, suppliers, sales, supplierOrders, payments, stockMovements] = await Promise.all([
      this.prisma.product.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.customer.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.supplier.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.sale.findMany({ include: { items: true }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.supplierOrder.findMany({ include: { items: true }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.payment.findMany({ orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.stockMovement.findMany({ orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
    ]);

    return {
      products: products.map((product) => this.mapProduct(product)),
      customers: customers.map((customer) => this.mapCustomer(customer)),
      suppliers: suppliers.map((supplier) => this.mapSupplier(supplier)),
      sales: sales.map((sale) => this.mapSale(sale)),
      supplierOrders: supplierOrders.map((order) => this.mapSupplierOrder(order)),
      payments: payments.map((payment) => ({
        id: payment.id,
        saleId: payment.saleId,
        customerId: payment.customerId,
        customerName: payment.customerName,
        date: toDayString(payment.date),
        amount: payment.amount,
        note: payment.note,
        createdAt: toIso(payment.createdAt),
      })),
      stockMovements: stockMovements.map((movement) => this.mapStockMovement(movement)),
    };
  }

  private buildSummary(database: Database) {
    const totalSpent = roundMoney(database.supplierOrders.reduce((sum, order) => sum + order.amountPaid, 0));
    const totalPurchases = roundMoney(database.supplierOrders.reduce((sum, order) => sum + order.totalAmount, 0));
    const supplierDebt = roundMoney(database.supplierOrders.reduce((sum, order) => sum + order.balanceDue, 0));
    const totalRevenue = roundMoney(database.sales.reduce((sum, sale) => sum + sale.totalAmount, 0));
    const totalReceived = roundMoney(database.sales.reduce((sum, sale) => sum + sale.amountReceived, 0));
    const customerDebt = roundMoney(database.sales.reduce((sum, sale) => sum + sale.balanceDue, 0));
    const grossProfit = roundMoney(database.sales.reduce((sum, sale) => sum + sale.profit, 0));
    const cashBalance = roundMoney(totalReceived - totalSpent);
    const stockValue = roundMoney(database.products.reduce((sum, product) => sum + product.stockQuantity * product.defaultPurchasePrice, 0));
    const lowStockProducts = database.products.filter((product) => product.stockQuantity <= product.lowStockThreshold);

    return {
      totalSpent,
      totalPurchases,
      supplierDebt,
      totalRevenue,
      totalReceived,
      customerDebt,
      grossProfit,
      cashBalance,
      stockValue,
      productCount: database.products.length,
      lowStockProducts,
      monthly: this.monthlySummary(database),
      customersWithDebt: this.withCustomerDebt(database).filter((customer) => customer.debt > 0),
      recentSales: database.sales.slice(0, 5),
      recentSupplierOrders: database.supplierOrders.slice(0, 5),
    };
  }

  private monthlySummary(database: Database) {
    const months = new Map<string, { month: string; revenue: number; received: number; spent: number; profit: number; customerDebt: number }>();
    const ensureMonth = (date: string) => {
      const month = date.slice(0, 7);
      if (!months.has(month)) {
        months.set(month, { month, revenue: 0, received: 0, spent: 0, profit: 0, customerDebt: 0 });
      }
      return months.get(month)!;
    };

    database.sales.forEach((sale) => {
      const item = ensureMonth(sale.date);
      item.revenue = roundMoney(item.revenue + sale.totalAmount);
      item.received = roundMoney(item.received + sale.amountReceived);
      item.profit = roundMoney(item.profit + sale.profit);
      item.customerDebt = roundMoney(item.customerDebt + sale.balanceDue);
    });

    database.supplierOrders.forEach((order) => {
      const item = ensureMonth(order.date);
      item.spent = roundMoney(item.spent + order.amountPaid);
    });

    return Array.from(months.values()).sort((a, b) => b.month.localeCompare(a.month));
  }

  private withCustomerDebt(database: Database) {
    return database.customers.map((customer) => {
      const sales = database.sales.filter((sale) => sale.customerId === customer.id);
      return {
        ...customer,
        totalPurchased: roundMoney(sales.reduce((sum, sale) => sum + sale.totalAmount, 0)),
        totalPaid: roundMoney(sales.reduce((sum, sale) => sum + sale.amountReceived, 0)),
        debt: roundMoney(sales.reduce((sum, sale) => sum + sale.balanceDue, 0)),
      };
    });
  }

  private calculateDiscount(subtotal: number, type: DiscountType, value: number) {
    if (value <= 0) {
      return 0;
    }
    if (type === 'percent') {
      return roundMoney(Math.min(subtotal, subtotal * (value / 100)));
    }
    return roundMoney(Math.min(subtotal, value));
  }

  private stockMovementData(
    product: Pick<Product, 'id' | 'name'>,
    type: StockMovement['type'],
    quantityChange: number,
    unitCost: number,
    reference: string,
  ) {
    return {
      productId: product.id,
      productName: product.name,
      type,
      quantityChange,
      unitCost,
      reference,
      date: toDateInput(),
    };
  }

  private mapProduct(product: any): Product {
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      unit: product.unit,
      stockQuantity: product.stockQuantity,
      lowStockThreshold: product.lowStockThreshold,
      defaultPurchasePrice: product.defaultPurchasePrice,
      defaultSalePrice: product.defaultSalePrice,
      createdAt: toIso(product.createdAt),
      updatedAt: toIso(product.updatedAt),
    };
  }

  private mapCustomer(customer: any): Customer {
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      createdAt: toIso(customer.createdAt),
    };
  }

  private mapSupplier(supplier: any): Supplier {
    return {
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email,
      createdAt: toIso(supplier.createdAt),
    };
  }

  private mapSale(sale: any): Sale {
    return {
      id: sale.id,
      customerId: sale.customerId,
      customerName: sale.customerName,
      date: toDayString(sale.date),
      items: (sale.items || []).map((item: any) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountType: item.discountType,
        discountValue: item.discountValue,
        unitCostSnapshot: item.unitCostSnapshot,
        lineSubtotal: item.lineSubtotal,
        discountAmount: item.discountAmount,
        lineTotal: item.lineTotal,
        lineCost: item.lineCost,
        lineProfit: item.lineProfit,
      })),
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      totalAmount: sale.totalAmount,
      costTotal: sale.costTotal,
      amountReceived: sale.amountReceived,
      balanceDue: sale.balanceDue,
      profit: sale.profit,
      createdAt: toIso(sale.createdAt),
      updatedAt: toIso(sale.updatedAt),
    };
  }

  private mapSupplierOrder(order: any): SupplierOrder {
    return {
      id: order.id,
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      date: toDayString(order.date),
      status: order.status,
      items: (order.items || []).map((item: any) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitCost: item.unitCost,
        lineTotal: item.lineTotal,
      })),
      deliveryFee: order.deliveryFee || 0,
      totalAmount: order.totalAmount,
      amountPaid: order.amountPaid,
      balanceDue: order.balanceDue,
      createdAt: toIso(order.createdAt),
      updatedAt: toIso(order.updatedAt),
    };
  }

  private mapStockMovement(movement: any): StockMovement {
    return {
      id: movement.id,
      productId: movement.productId,
      productName: movement.productName,
      type: movement.type,
      quantityChange: movement.quantityChange,
      unitCost: movement.unitCost,
      reference: movement.reference,
      date: toDayString(movement.date),
      createdAt: toIso(movement.createdAt),
    };
  }

  private weightedAverageCost(currentQuantity: number, currentUnitCost: number, addedQuantity: number, addedUnitCost: number) {
    const nextQuantity = currentQuantity + addedQuantity;
    if (nextQuantity <= 0) {
      return roundMoney(addedUnitCost);
    }
    return roundMoney((currentQuantity * currentUnitCost + addedQuantity * addedUnitCost) / nextQuantity);
  }

  private requireText(value: unknown, message: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(message);
    }
  }
}
