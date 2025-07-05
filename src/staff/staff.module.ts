import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterFile } from 'src/entities/master-file.entity';
import { S3Service } from 'src/utils/s3.service';
import { Patient } from 'src/entities/patient.entity';
import { LabSession } from 'src/entities/lab-session.entity';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([MasterFile,Patient,LabSession])],
  controllers: [StaffController],
  providers: [StaffService,S3Service],
})
export class StaffModule {}
