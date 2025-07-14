import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LabTestService } from './lab-test.service';
import { LabTestController } from './lab-test.controller';
import { FastqFile } from '../entities/fastq-file.entity';
import { LabSession } from '../entities/lab-session.entity';
import { User } from 'src/entities/user.entity';
import { Patient } from 'src/entities/patient.entity';
import { S3Service } from '../utils/s3.service';
import { Notifications } from 'src/entities/notification.entity';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FastqFile, LabSession, User, Patient]),
    NotificationModule,
  ],
  controllers: [LabTestController],
  providers: [LabTestService, S3Service],
})
export class LabTestModule {}
