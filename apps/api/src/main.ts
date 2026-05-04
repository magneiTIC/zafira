import { config } from 'dotenv';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

config({ path: join(process.cwd(), '.env') });
config({ path: join(process.cwd(), 'apps', 'api', '.env') });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  });
  app.setGlobalPrefix('api');
  await app.listen(4000);
}

void bootstrap();
