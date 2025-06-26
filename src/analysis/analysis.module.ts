import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisService } from './analysis.service';
import { AnalysisController } from './analysis.controller';
import { LabSession } from '../entities/lab-session.entity';
import { FastqFile } from '../entities/fastq-file.entity';
import { EtlResult } from '../entities/etl-result.entity';
import { S3Service } from '../utils/s3.service';

@Module({
  imports: [TypeOrmModule.forFeature([LabSession, FastqFile, EtlResult])],
  controllers: [AnalysisController],
  providers: [AnalysisService, S3Service],
  exports: [AnalysisService],
})
export class AnalysisModule {}
