import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Configure Express to handle larger file uploads
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));
  app.use(express.raw({ limit: '100mb' }));

  app.enableCors({ origin: '*' });
  app.setGlobalPrefix('api/v1');
  const config = new DocumentBuilder()
  .setTitle('BDGAD BE API')
  .setDescription('The BDGAD BE API description')
  .setVersion('1.0')
  .addTag('BDGAD BE')
  .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );
  await app.listen(configService.get('PORT') ?? 3000);
}
bootstrap();
