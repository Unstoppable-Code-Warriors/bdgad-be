import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class GeneralFilesQueryDto extends PaginationQueryDto {
  @ApiProperty({
    description: 'Filter by category ID',
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  categoryGeneralFileId?: number;
}
