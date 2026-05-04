import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  AdjustStockDto,
  CreateCustomerDto,
  CreatePaymentDto,
  CreateProductDto,
  CreateSaleDto,
  CreateSupplierDto,
  CreateSupplierOrderDto,
} from './models';
import { BusinessService } from './business.service';

@Controller()
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Get('bootstrap')
  bootstrap() {
    return this.business.getAll();
  }

  @Get('products')
  products() {
    return this.business.getProducts();
  }

  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.business.createProduct(dto);
  }

  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: Partial<CreateProductDto>) {
    return this.business.updateProduct(id, dto);
  }

  @Post('products/:id/adjust-stock')
  adjustStock(@Param('id') id: string, @Body() dto: AdjustStockDto) {
    return this.business.adjustStock(id, dto);
  }

  @Get('customers')
  customers() {
    return this.business.getCustomers();
  }

  @Post('customers')
  createCustomer(@Body() dto: CreateCustomerDto) {
    return this.business.createCustomer(dto);
  }

  @Get('suppliers')
  suppliers() {
    return this.business.getSuppliers();
  }

  @Post('suppliers')
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.business.createSupplier(dto);
  }

  @Get('sales')
  sales() {
    return this.business.getSales();
  }

  @Post('sales')
  createSale(@Body() dto: CreateSaleDto) {
    return this.business.createSale(dto);
  }

  @Post('sales/:id/payments')
  addPayment(@Param('id') id: string, @Body() dto: CreatePaymentDto) {
    return this.business.addPayment(id, dto);
  }

  @Get('supplier-orders')
  supplierOrders() {
    return this.business.getSupplierOrders();
  }

  @Post('supplier-orders')
  createSupplierOrder(@Body() dto: CreateSupplierOrderDto) {
    return this.business.createSupplierOrder(dto);
  }

  @Get('reports/summary')
  summary() {
    return this.business.getSummary();
  }
}
