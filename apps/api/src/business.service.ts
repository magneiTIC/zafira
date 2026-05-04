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
import { StoreService } from './store.service';

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const toNumber = (value: unknown, fallback = 0) => roundMoney(Number(value ?? fallback));
const today = () => new Date().toISOString().slice(0, 10);
const stamp = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

@Injectable()
export class BusinessService {
  constructor(private readonly store: StoreService) {}

  getAll() {
    const database = this.store.read();
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

  getProducts() {
    return this.store.read().products;
  }

  createProduct(dto: CreateProductDto) {
    this.requireText(dto.name, 'Le nom du produit est obligatoire.');
    const now = stamp();
    const product: Product = {
      id: id('prod'),
      name: dto.name.trim(),
      sku: dto.sku?.trim() || '',
      category: dto.category?.trim() || 'General',
      unit: dto.unit?.trim() || 'piece',
      stockQuantity: toNumber(dto.stockQuantity),
      lowStockThreshold: toNumber(dto.lowStockThreshold, 5),
      defaultPurchasePrice: toNumber(dto.defaultPurchasePrice),
      defaultSalePrice: toNumber(dto.defaultSalePrice),
      createdAt: now,
      updatedAt: now,
    };

    this.store.update((database) => {
      database.products.push(product);
      if (product.stockQuantity !== 0) {
        database.stockMovements.push(this.stockMovement(product, 'adjustment', product.stockQuantity, product.defaultPurchasePrice, 'Stock initial'));
      }
    });

    return product;
  }

  updateProduct(productId: string, dto: Partial<CreateProductDto>) {
    let updated: Product | undefined;
    this.store.update((database) => {
      const product = this.findProduct(database, productId);
      const previousStock = product.stockQuantity;
      product.name = dto.name?.trim() || product.name;
      product.sku = dto.sku?.trim() ?? product.sku;
      product.category = dto.category?.trim() || product.category;
      product.unit = dto.unit?.trim() || product.unit;
      product.lowStockThreshold = dto.lowStockThreshold === undefined ? product.lowStockThreshold : toNumber(dto.lowStockThreshold);
      product.defaultPurchasePrice = dto.defaultPurchasePrice === undefined ? product.defaultPurchasePrice : toNumber(dto.defaultPurchasePrice);
      product.defaultSalePrice = dto.defaultSalePrice === undefined ? product.defaultSalePrice : toNumber(dto.defaultSalePrice);
      if (dto.stockQuantity !== undefined) {
        product.stockQuantity = toNumber(dto.stockQuantity);
        const change = roundMoney(product.stockQuantity - previousStock);
        if (change !== 0) {
          database.stockMovements.push(this.stockMovement(product, 'adjustment', change, product.defaultPurchasePrice, 'Correction de stock'));
        }
      }
      product.updatedAt = stamp();
      updated = product;
    });
    return updated;
  }

  adjustStock(productId: string, dto: AdjustStockDto) {
    let updated: Product | undefined;
    this.store.update((database) => {
      const product = this.findProduct(database, productId);
      const quantityChange = toNumber(dto.quantityChange);
      product.stockQuantity = roundMoney(product.stockQuantity + quantityChange);
      product.updatedAt = stamp();
      database.stockMovements.push(
        this.stockMovement(product, 'adjustment', quantityChange, toNumber(dto.unitCost, product.defaultPurchasePrice), dto.note || 'Ajustement manuel'),
      );
      updated = product;
    });
    return updated;
  }

  getCustomers() {
    return this.withCustomerDebt(this.store.read());
  }

  createCustomer(dto: CreateCustomerDto) {
    this.requireText(dto.name, 'Le nom du client est obligatoire.');
    const customer: Customer = {
      id: id('cust'),
      name: dto.name.trim(),
      phone: dto.phone?.trim() || '',
      email: dto.email?.trim() || '',
      createdAt: stamp(),
    };
    this.store.update((database) => database.customers.push(customer));
    return customer;
  }

  getSuppliers() {
    return this.store.read().suppliers;
  }

  createSupplier(dto: CreateSupplierDto) {
    this.requireText(dto.name, 'Le nom du fournisseur est obligatoire.');
    const supplier: Supplier = {
      id: id('sup'),
      name: dto.name.trim(),
      phone: dto.phone?.trim() || '',
      email: dto.email?.trim() || '',
      createdAt: stamp(),
    };
    this.store.update((database) => database.suppliers.push(supplier));
    return supplier;
  }

  getSales() {
    return this.store.read().sales;
  }

  createSale(dto: CreateSaleDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('La vente doit contenir au moins un produit.');
    }

    let sale: Sale | undefined;
    this.store.update((database) => {
      const customer = this.findCustomer(database, dto.customerId);
      const saleItems = dto.items.map((item) => {
        const product = this.findProduct(database, item.productId);
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
        const lineProfit = roundMoney(lineTotal - lineCost);

        product.stockQuantity = roundMoney(product.stockQuantity - quantity);
        product.updatedAt = stamp();

        return {
          id: id('sale-item'),
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
          lineProfit,
        };
      });

      const subtotal = roundMoney(saleItems.reduce((sum, item) => sum + item.lineSubtotal, 0));
      const discountTotal = roundMoney(saleItems.reduce((sum, item) => sum + item.discountAmount, 0));
      const totalAmount = roundMoney(saleItems.reduce((sum, item) => sum + item.lineTotal, 0));
      const costTotal = roundMoney(saleItems.reduce((sum, item) => sum + item.lineCost, 0));
      const amountReceived = Math.min(toNumber(dto.amountReceived), totalAmount);
      const createdAt = stamp();
      sale = {
        id: id('sale'),
        customerId: customer.id,
        customerName: customer.name,
        date: dto.date || today(),
        items: saleItems,
        subtotal,
        discountTotal,
        totalAmount,
        costTotal,
        amountReceived,
        balanceDue: roundMoney(totalAmount - amountReceived),
        profit: roundMoney(totalAmount - costTotal),
        createdAt,
        updatedAt: createdAt,
      };

      database.sales.unshift(sale);
      if (amountReceived > 0) {
        database.payments.unshift({
          id: id('pay'),
          saleId: sale.id,
          customerId: customer.id,
          customerName: customer.name,
          date: sale.date,
          amount: amountReceived,
          note: 'Avance ou paiement initial',
          createdAt,
        });
      }
      saleItems.forEach((item) => {
        database.stockMovements.push({
          id: id('move'),
          productId: item.productId,
          productName: item.productName,
          type: 'sale',
          quantityChange: -item.quantity,
          unitCost: item.unitCostSnapshot,
          reference: `Vente ${sale?.id}`,
          date: sale?.date || today(),
          createdAt,
        });
      });
    });

    return sale;
  }

  addPayment(saleId: string, dto: CreatePaymentDto) {
    const amount = toNumber(dto.amount);
    if (amount <= 0) {
      throw new BadRequestException('Le montant du paiement doit etre positif.');
    }

    let sale: Sale | undefined;
    this.store.update((database) => {
      sale = this.findSale(database, saleId);
      const acceptedAmount = Math.min(amount, sale.balanceDue);
      if (acceptedAmount <= 0) {
        throw new BadRequestException('Cette vente est deja soldee.');
      }
      sale.amountReceived = roundMoney(sale.amountReceived + acceptedAmount);
      sale.balanceDue = roundMoney(sale.totalAmount - sale.amountReceived);
      sale.updatedAt = stamp();
      database.payments.unshift({
        id: id('pay'),
        saleId: sale.id,
        customerId: sale.customerId,
        customerName: sale.customerName,
        date: dto.date || today(),
        amount: acceptedAmount,
        note: dto.note?.trim() || 'Reglement client',
        createdAt: stamp(),
      });
    });
    return sale;
  }

  getSupplierOrders() {
    return this.store.read().supplierOrders;
  }

  createSupplierOrder(dto: CreateSupplierOrderDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('La commande fournisseur doit contenir au moins un produit.');
    }

    let order: SupplierOrder | undefined;
    this.store.update((database) => {
      const supplier = this.findSupplier(database, dto.supplierId);
      const createdAt = stamp();
      const orderItems = dto.items.map((item) => {
        const product = this.findProduct(database, item.productId);
        const quantity = toNumber(item.quantity);
        if (quantity <= 0) {
          throw new BadRequestException(`La quantite de ${product.name} doit etre positive.`);
        }
        const unitCost = toNumber(item.unitCost, product.defaultPurchasePrice);
        return {
          id: id('supplier-item'),
          productId: product.id,
          productName: product.name,
          quantity,
          unitCost,
          lineTotal: roundMoney(quantity * unitCost),
        };
      });
      const totalAmount = roundMoney(orderItems.reduce((sum, item) => sum + item.lineTotal, 0));
      const amountPaid = Math.min(toNumber(dto.amountPaid), totalAmount);
      order = {
        id: id('order'),
        supplierId: supplier.id,
        supplierName: supplier.name,
        date: dto.date || today(),
        status: dto.status || 'received',
        items: orderItems,
        totalAmount,
        amountPaid,
        balanceDue: roundMoney(totalAmount - amountPaid),
        createdAt,
        updatedAt: createdAt,
      };

      database.supplierOrders.unshift(order);
      if (order.status === 'received') {
        this.receiveSupplierOrder(database, order);
      }
    });

    return order;
  }

  getSummary() {
    return this.buildSummary(this.store.read());
  }

  private receiveSupplierOrder(database: Database, order: SupplierOrder) {
    order.items.forEach((item) => {
      const product = this.findProduct(database, item.productId);
      product.stockQuantity = roundMoney(product.stockQuantity + item.quantity);
      product.defaultPurchasePrice = item.unitCost;
      product.updatedAt = stamp();
      database.stockMovements.push({
        id: id('move'),
        productId: product.id,
        productName: product.name,
        type: 'purchase',
        quantityChange: item.quantity,
        unitCost: item.unitCost,
        reference: `Commande fournisseur ${order.id}`,
        date: order.date,
        createdAt: stamp(),
      });
    });
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

  private stockMovement(product: Product, type: StockMovement['type'], quantityChange: number, unitCost: number, reference: string): StockMovement {
    return {
      id: id('move'),
      productId: product.id,
      productName: product.name,
      type,
      quantityChange,
      unitCost,
      reference,
      date: today(),
      createdAt: stamp(),
    };
  }

  private findProduct(database: Database, productId: string) {
    const product = database.products.find((item) => item.id === productId);
    if (!product) {
      throw new NotFoundException('Produit introuvable.');
    }
    return product;
  }

  private findCustomer(database: Database, customerId: string) {
    const customer = database.customers.find((item) => item.id === customerId);
    if (!customer) {
      throw new NotFoundException('Client introuvable.');
    }
    return customer;
  }

  private findSupplier(database: Database, supplierId: string) {
    const supplier = database.suppliers.find((item) => item.id === supplierId);
    if (!supplier) {
      throw new NotFoundException('Fournisseur introuvable.');
    }
    return supplier;
  }

  private findSale(database: Database, saleId: string) {
    const sale = database.sales.find((item) => item.id === saleId);
    if (!sale) {
      throw new NotFoundException('Vente introuvable.');
    }
    return sale;
  }

  private requireText(value: unknown, message: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(message);
    }
  }
}
