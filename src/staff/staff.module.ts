import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterFile } from 'src/entities/master-file.entity';
import { S3Service } from 'src/utils/s3.service';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([MasterFile])],
  controllers: [StaffController],
  providers: [StaffService,S3Service],
})
export class StaffModule {}
