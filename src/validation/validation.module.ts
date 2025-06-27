import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ValidationController } from './validation.controller';
import { ValidationService } from './validation.service';
import { LabSession } from '../entities/lab-session.entity';
import { EtlResult } from '../entities/etl-result.entity';
import { FastqFile } from '../entities/fastq-file.entity';
import { S3Service } from '../utils/s3.service';

@Module({
  imports: [TypeOrmModule.forFeature([LabSession, EtlResult, FastqFile])],
  controllers: [ValidationController],
  providers: [ValidationService, S3Service],
})
export class ValidationModule {}
