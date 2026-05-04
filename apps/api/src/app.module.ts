import { Module } from '@nestjs/common';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';
import { PrismaService } from './prisma.service';

@Module({
  controllers: [BusinessController],
  providers: [BusinessService, PrismaService],
})
export class AppModule {}
