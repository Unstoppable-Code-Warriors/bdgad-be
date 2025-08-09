import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeneralFile } from 'src/entities/general-file.entity';
import { S3Service } from 'src/utils/s3.service';
import { Patient } from 'src/entities/patient.entity';
import { LabSession } from 'src/entities/lab-session.entity';
import { PatientFile } from 'src/entities/patient-file.entity';
import { User } from 'src/entities/user.entity';
import { LabCodeLabSession } from '../entities/labcode-lab-session.entity';
import { AssignLabSession } from '../entities/assign-lab-session.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { CategoryGeneralFileModule } from 'src/category-general-file/category-general-file.module';
import { FileValidationService } from './services/file-validation.service';
import { FastqFilePair } from 'src/entities/fastq-file-pair.entity';
import { CategoryGeneralFile } from 'src/entities/category-general-file.entity';
import { RabbitmqModule } from 'src/rabbitmq/rabbitmq.module';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      GeneralFile,
      Patient,
      LabSession,
      PatientFile,
      User,
      LabCodeLabSession,
      AssignLabSession,
      FastqFilePair,
      CategoryGeneralFile,
    ]),
    NotificationModule,
    CategoryGeneralFileModule,
    RabbitmqModule,
  ],
  controllers: [StaffController],
  providers: [StaffService, S3Service, FileValidationService],
})
export class StaffModule {}
