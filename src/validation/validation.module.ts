import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ValidationController } from './validation.controller';
import { ValidationService } from './validation.service';
import { LabSession } from '../entities/lab-session.entity';
import { EtlResult } from '../entities/etl-result.entity';
import { FastqFilePair } from '../entities/fastq-file-pair.entity';
import { LabCodeLabSession } from '../entities/labcode-lab-session.entity';
import { AssignLabSession } from '../entities/assign-lab-session.entity';
import { S3Service } from '../utils/s3.service';
import { NotificationModule } from 'src/notification/notification.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Env } from 'src/utils/constant';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LabSession,
      EtlResult,
      FastqFilePair,
      LabCodeLabSession,
      AssignLabSession,
    ]),
    NotificationModule,
    ClientsModule.registerAsync([
      {
        name: 'ETL_RESULT_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              configService.get<string>(Env.RABBITMQ_URL) ||
                'amqp://localhost:5672',
            ],
            queue: 'etl_dw',
            queueOptions: {
              durable: false,
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [ValidationController],
  providers: [ValidationService, S3Service],
})
export class ValidationModule {}
