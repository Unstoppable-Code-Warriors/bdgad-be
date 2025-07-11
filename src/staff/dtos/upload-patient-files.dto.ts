import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsEnum,
  IsOptional,
  IsJSON,
  IsObject,
  IsArray,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { TypeLabSession } from 'src/utils/constant';

export class UploadPatientFilesDto {
  @ApiProperty({
    description: 'Patient ID',
    example: 1,
  })
  @IsNumber()
  @Type(() => Number)
  @IsNotEmpty()
  patientId: number;

  @ApiProperty({
    description: 'Doctor ID',
    example: 1,
  })
  @IsNumber()
  @Type(() => Number)
  @IsNotEmpty()
  doctorId: number;

  @ApiProperty({
    description: 'Lab Testing ID',
    example: 1,
  })
  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  labTestingId?: number;

  @ApiProperty({
    description: 'Type of lab session',
    enum: TypeLabSession,
    example: TypeLabSession.TEST,
  })
  @IsEnum(TypeLabSession)
  @IsNotEmpty()
  typeLabSession: TypeLabSession;

  @ApiProperty({
    description:
      'OCR results as JSON string. Array of objects with filename as key and OCR result as value',
    example:
      '[{"filename1.jpg": {"text": "sample text", "confidence": 0.95}}, {"filename2.jpg": null}]',
    required: false,
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (error) {
        return value;
      }
    }
    return value;
  })
  @IsOptional()
  ocrResult?: any;
}
