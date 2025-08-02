import { IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePatientFilesDto {
  @ApiProperty({
    description:
      'OCR results as JSON string. Array of objects with filename as key and OCR result as value',
    example:
      '[{"filename1": {"text": "sample text", "confidence": 0.95}}, {"filename2": null}]',
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
