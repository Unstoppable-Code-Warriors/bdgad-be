import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Configure Express to handle larger file uploads
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));
  app.use(express.raw({ limit: '100mb' }));

  // Enable CORS for both HTTP and WebSocket
  // app.enableCors({
  //   origin: "*",
  //   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  //   allowedHeaders: ['Content-Type', 'Authorization'],
  //   credentials: true,
  // });

  app.enableCors({
    origin: [
      /^http:\/\/localhost(:\d+)?$/,
      /^https?:\/\/.*\.bdgad\.bio$/,
      /^https?:\/\/bdgad\.bio$/,
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Authorization',
  });

  // Configure WebSocket adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  app.setGlobalPrefix('api/v1');
  const config = new DocumentBuilder()
    .setTitle('BDGAD BE API')
    .setDescription('The BDGAD BE API description')
    .setVersion('1.0')
    .addSecurity('token', { type: 'http', scheme: 'bearer' })
    .build();
  const documentFactory = () =>
    SwaggerModule.createDocument(app, config, {
      autoTagControllers: false,
    });
  SwaggerModule.setup('api', app, documentFactory(), {
    swaggerOptions: { persistAuthorization: true },
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );

  const rmqUrl =
    configService.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672';
  const microserviceOptions: MicroserviceOptions = {
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl],
      queue: 'pharmacy_be',
      queueOptions: {
        durable: false,
      },
    },
  };

  app.connectMicroservice(microserviceOptions);
  await app.startAllMicroservices();

  await app.listen(configService.get('PORT') ?? 3000);
}
void bootstrap();
