import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryGeneralFileController } from './category-general-file.controller';
import { CategoryGeneralFileService } from './category-general-file.service';
import { CategoryGeneralFile } from '../entities/category-general-file.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CategoryGeneralFile])],
  controllers: [CategoryGeneralFileController],
  providers: [CategoryGeneralFileService],
  exports: [CategoryGeneralFileService],
})
export class CategoryGeneralFileModule {}
