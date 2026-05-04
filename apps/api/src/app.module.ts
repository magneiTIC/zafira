import { Module } from '@nestjs/common';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';
import { StoreService } from './store.service';

@Module({
  controllers: [BusinessController],
  providers: [BusinessService, StoreService],
})
export class AppModule {}
