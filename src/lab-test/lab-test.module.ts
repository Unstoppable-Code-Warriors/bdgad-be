import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LabTestService } from './lab-test.service';
import { LabTestController } from './lab-test.controller';
import { FastqFile } from '../entities/fastq-file.entity';
import { LabSession } from '../entities/lab-session.entity';
import { User } from 'src/entities/user.entity';
import { Patient } from 'src/entities/patient.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FastqFile, LabSession, User, Patient])],
  controllers: [LabTestController],
  providers: [LabTestService],
})
export class LabTestModule {}
