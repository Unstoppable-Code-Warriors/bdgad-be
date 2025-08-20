import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { AnalysisService } from './analysis.service';
import { AnalysisController } from './analysis.controller';
import { AnalysisCronService } from './analysis.cron.service';
import { LabSession } from '../entities/lab-session.entity';
import { LabCodeLabSession } from '../entities/labcode-lab-session.entity';
import { AssignLabSession } from '../entities/assign-lab-session.entity';
import { FastqFilePair } from '../entities/fastq-file-pair.entity';
import { EtlResult } from '../entities/etl-result.entity';
import { S3Service } from '../utils/s3.service';
import { User } from 'src/entities/user.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { AnalysisQueueController } from './analysis.queue.controller';
import { ScheduledEtlTask } from 'src/entities/scheduled-etl-task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LabSession,
      LabCodeLabSession,
      AssignLabSession,
      FastqFilePair,
      EtlResult,
      User,
      ScheduledEtlTask,
    ]),
    HttpModule,
    NotificationModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AnalysisController, AnalysisQueueController],
  providers: [AnalysisService, AnalysisCronService, S3Service],
  exports: [AnalysisService],
})
export class AnalysisModule {}
