import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { StaffModule } from './staff/staff.module';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().default(3000),
        STORE_PATH: Joi.string().default('./uploads'),
        OCR_SERVICE: Joi.string().optional(),
      }),
    }),
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    StaffModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
