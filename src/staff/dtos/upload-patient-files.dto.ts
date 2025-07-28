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

  @ApiProperty({
    description: 'Array of lab codes for the session (duplicates allowed)',
    example: ['O5123A', 'N5456B', 'O5123A'],
    required: false,
    type: [String],
  })
  @Transform(({ value }) => {
    // Handle form data input - could be string, array, or JSON string
    if (typeof value === 'string') {
      try {
        // Try to parse as JSON array first
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [value];
      } catch (error) {
        // If not JSON, treat as comma-separated string or single value
        return value.includes(',') ? value.split(',').map(s => s.trim()) : [value];
      }
    }
    // If already an array, return as is
    if (Array.isArray(value)) {
      return value;
    }
    // Fallback to empty array
    return [];
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labcode?: string[];
}
