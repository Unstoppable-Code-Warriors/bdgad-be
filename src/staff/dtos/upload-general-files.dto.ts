import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsNumber, IsString, MaxLength } from 'class-validator';

export class UploadGeneralFilesDto {
  @ApiProperty({
    description: 'Category ID for the general files',
    example: 1,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  categoryGeneralFileId: number;

  @ApiProperty({
    description: 'Description for the uploaded files',
    example: 'Important documents',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
