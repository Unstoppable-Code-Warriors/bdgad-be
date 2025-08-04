import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { TypeLabSession } from 'src/utils/constant';

export enum FileCategory {
  PRENATAL_SCREENING = 'prenatal_screening',
  HEREDITARY_CANCER = 'hereditary_cancer',
  GENE_MUTATION = 'gene_mutation',
  GENERAL = 'general',
}

export class FileCategoryDto {
  @ApiProperty({
    description: 'File category to determine OCR processing type',
    enum: FileCategory,
    example: FileCategory.HEREDITARY_CANCER,
  })
  @IsEnum(FileCategory)
  @IsNotEmpty()
  category: FileCategory;

  @ApiProperty({
    description: 'Processing priority (1-10, higher number = higher priority)',
    example: 5,
    required: false,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  priority?: number;

  @ApiProperty({
    description: 'Original file name for reference',
    example: 'hereditary_cancer_form.pdf',
  })
  @IsString()
  @IsNotEmpty()
  fileName: string;
}

export class OCRResultDto {
  @ApiProperty({
    description: 'Index of the file in the uploaded files array',
    example: 0,
  })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  fileIndex: number;

  @ApiProperty({
    description: 'File category that matches the OCR result',
    enum: FileCategory,
    example: FileCategory.HEREDITARY_CANCER,
  })
  @IsEnum(FileCategory)
  category: FileCategory;

  @ApiProperty({
    description: 'OCR processed data specific to the file category',
    example: {
      full_name: 'Nguyen Van A',
      date_of_birth: '1990-01-01',
      cancer_screening_package: 'bcare',
    },
  })
  @IsOptional()
  ocrData?: any;

  @ApiProperty({
    description: 'Edited OCR data used for labcode generation',
    example: {
      cancer_panel: 'onco81',
      biopsy_tissue_ffpe: true,
      blood_stl_ctdna: false,
      pleural_peritoneal_fluid: false,
      nipt_package: 'nipt_5',
      cancer_screening_package: 'bcare',
    },
  })
  @IsOptional()
  editedData?: any;

  @ApiProperty({
    description: 'OCR confidence score (0-1)',
    example: 0.95,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  confidence?: number;
}

export class UploadCategorizedFilesDto {
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
      'Array of file category mappings (must match uploaded files order)',
    type: [FileCategoryDto],
    example: [
      {
        category: 'hereditary_cancer',
        priority: 8,
        fileName: 'hereditary_cancer_form.pdf',
      },
      {
        category: 'gene_mutation',
        priority: 7,
        fileName: 'gene_mutation_test.jpg',
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FileCategoryDto)
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return Array.isArray(value) ? value : [];
  })
  fileCategories: FileCategoryDto[];

  @ApiProperty({
    description: 'Array of OCR results mapped to specific files',
    type: [OCRResultDto],
    example: [
      {
        fileIndex: 0,
        category: 'hereditary_cancer',
        confidence: 0.95,
        ocrData: {
          full_name: 'Nguyen Van A',
          date_of_birth: '1990-01-01',
          cancer_screening_package: 'bcare',
        },
        editedData: {
          cancer_screening_package: 'bcare',
        },
      },
    ],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OCRResultDto)
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return Array.isArray(value) ? value : [];
  })
  ocrResults?: OCRResultDto[];
}
