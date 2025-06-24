import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { DbModule } from './db/db.module';
import * as Joi from 'joi';
import { Env } from './utils/constant';
import { StaffModule } from './staff/staff.module';
import { LabTestModule } from './lab-test/lab-test.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object<Record<Env, Joi.AnySchema>>({
        PORT: Joi.number().default(3000),
        STORE_PATH: Joi.string().default('./uploads'),
        OCR_SERVICE: Joi.string().optional(),
        DB_HOST: Joi.string().required(),
        DB_PORT: Joi.number().default(5432),
        DB_USER: Joi.string().required(),
        DB_PASS: Joi.string().required(),
        DB_NAME: Joi.string().required(),
      }),
    }),
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    StaffModule,
    DbModule,
    LabTestModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
