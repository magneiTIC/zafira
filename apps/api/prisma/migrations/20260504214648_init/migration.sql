-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "lowStockThreshold" SET DEFAULT 2;

-- AlterTable
ALTER TABLE "SupplierOrder" ADD COLUMN     "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
