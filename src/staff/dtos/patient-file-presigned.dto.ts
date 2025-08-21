import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PatientFilePresignedDto {
  @ApiProperty({
    description: 'Patient file path (S3 URL or key path)',
    example: 's3://patient-files/session-123/1752308785301_medical_report.pdf',
  })
  @IsString()
  @IsNotEmpty()
  filePath: string;

  @ApiProperty({
    description: 'URL expiration time in seconds (default: 3600 - 1 hour)',
    example: 3600,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expiresIn?: number = 3600;
}
