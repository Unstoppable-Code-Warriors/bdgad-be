import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { DbModule } from './db/db.module';
import * as Joi from 'joi';
import { Env } from './utils/constant';
import { StaffModule } from './staff/staff.module';
import { LabTestModule } from './lab-test/lab-test.module';
import { AuthModule } from './auth/auth.module';
import { AnalysisModule } from './analysis/analysis.module';
import { ValidationModule } from './validation/validation.module';
import { NotificationModule } from './notification/notification.module';
import { NotificaitonService } from './notificaiton/notificaiton.service';

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
        AUTH_SERVICE: Joi.string().required(),
        S3_ENDPOINT: Joi.string().required(),
        S3_ACCESS_KEY_ID: Joi.string().required(),
        S3_SECRET_ACCESS_KEY: Joi.string().required(),
      }),
    }),
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    AuthModule,
    StaffModule,
    DbModule,
    LabTestModule,
    AnalysisModule,
    ValidationModule,
    NotificationModule,
  ],
  controllers: [],
  providers: [NotificaitonService],
})
export class AppModule {}
