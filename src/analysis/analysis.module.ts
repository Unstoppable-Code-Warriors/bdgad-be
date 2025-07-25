import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisService } from './analysis.service';
import { AnalysisController } from './analysis.controller';
import { LabSession } from '../entities/lab-session.entity';
import { FastqFilePair } from '../entities/fastq-file-pair';
import { EtlResult } from '../entities/etl-result.entity';
import { S3Service } from '../utils/s3.service';
import { User } from 'src/entities/user.entity';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LabSession, FastqFilePair, EtlResult, User]),
    NotificationModule,
  ],
  controllers: [AnalysisController],
  providers: [AnalysisService, S3Service],
  exports: [AnalysisService],
})
export class AnalysisModule {}
