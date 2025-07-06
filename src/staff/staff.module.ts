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

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([GeneralFile,Patient,LabSession,PatientFile,User])],
  controllers: [StaffController],
  providers: [StaffService,S3Service],
})
export class StaffModule {}
