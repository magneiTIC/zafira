export type OrderStatus = 'pending' | 'received';
export type DiscountType = 'amount' | 'percent';
export type StockMovementType = 'purchase' | 'sale' | 'adjustment';

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  stockQuantity: number;
  lowStockThreshold: number;
  defaultPurchasePrice: number;
  defaultSalePrice: number;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountType: DiscountType;
  discountValue: number;
  unitCostSnapshot: number;
  lineSubtotal: number;
  discountAmount: number;
  lineTotal: number;
  lineCost: number;
  lineProfit: number;
}

export interface Sale {
  id: string;
  customerId: string;
  customerName: string;
  date: string;
  items: SaleItem[];
  subtotal: number;
  discountTotal: number;
  totalAmount: number;
  costTotal: number;
  amountReceived: number;
  balanceDue: number;
  profit: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierOrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface SupplierOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string;
  status: OrderStatus;
  items: SupplierOrderItem[];
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  saleId: string;
  customerId: string;
  customerName: string;
  date: string;
  amount: number;
  note: string;
  createdAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: StockMovementType;
  quantityChange: number;
  unitCost: number;
  reference: string;
  date: string;
  createdAt: string;
}

export interface Database {
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  sales: Sale[];
  supplierOrders: SupplierOrder[];
  payments: Payment[];
  stockMovements: StockMovement[];
}

export interface CreateProductDto {
  name: string;
  sku?: string;
  category?: string;
  unit?: string;
  stockQuantity?: number;
  lowStockThreshold?: number;
  defaultPurchasePrice?: number;
  defaultSalePrice?: number;
}

export interface CreateCustomerDto {
  name: string;
  phone?: string;
  email?: string;
}

export interface CreateSupplierDto {
  name: string;
  phone?: string;
  email?: string;
}

export interface CreateSaleDto {
  customerId: string;
  date?: string;
  amountReceived?: number;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice?: number;
    discountType?: DiscountType;
    discountValue?: number;
  }>;
}

export interface CreateSupplierOrderDto {
  supplierId: string;
  date?: string;
  status?: OrderStatus;
  amountPaid?: number;
  items: Array<{
    productId: string;
    quantity: number;
    unitCost?: number;
  }>;
}

export interface CreatePaymentDto {
  amount: number;
  date?: string;
  note?: string;
}

export interface AdjustStockDto {
  quantityChange: number;
  unitCost?: number;
  note?: string;
}
