import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum TestType {
  NON_INVASIVE_PRENATAL_TESTING = 'non_invasive_prenatal_testing',
  HEREDITARY_CANCER = 'hereditary_cancer',
  GENE_MUTATION_TESTING = 'gene_mutation_testing',
}

export enum NIPTPackageType {
  NIPT_CNV = 'NIPT CNV',
  NIPT_24 = 'NIPT 24',
  NIPT_5 = 'NIPT 5',
  NIPT_4 = 'NIPT 4',
  NIPT_3 = 'NIPT 3',
}

export enum HereditaryCancerPackageType {
  BREAST_CANCER_BCARE = 'breast_cancer_bcare',
  FIFTEEN_HEREDITARY_CANCER_TYPES_MORE_CARE = '15_hereditary_cancer_types_more_care',
  TWENTY_HEREDITARY_CANCER_TYPES_VIP_CARE = '20_hereditary_cancer_types_vip_care',
}

export enum GeneMutationPackageType {
  ONCO81 = 'Onco81',
  ONCO500 = 'Onco500',
  LUNG_CANCER = 'lung_cancer',
  OVARIAN_CANCER = 'ovarian_cancer',
  COLORECTAL_CANCER = 'colorectal_cancer',
  PROSTATE_CANCER = 'prostate_cancer',
  BREAST_CANCER = 'breast_cancer',
  CERVICAL_CANCER = 'cervical_cancer',
  GASTRIC_CANCER = 'gastric_cancer',
  PANCREATIC_CANCER = 'pancreatic_cancer',
  THYROID_CANCER = 'thyroid_cancer',
  GASTROINTESTINAL_STROMAL_TUMOR_GIST = 'gastrointestinal_stromal_tumor_gist',
}

export enum SampleType {
  BIOPSY_TISSUE_FFPE = 'biopsy_tissue_ffpe',
  BLOOD_STL_CTDNA = 'blood_stl_ctdna',
  PLEURAL_PERITONEAL_FLUID = 'pleural_peritoneal_fluid',
}

export class GenerateLabcodeRequestDto {
  @ApiProperty({
    enum: TestType,
    example: TestType.NON_INVASIVE_PRENATAL_TESTING,
    description: 'Type of test to generate labcode for',
  })
  @IsEnum(TestType)
  testType: TestType;

  @ApiProperty({
    example: NIPTPackageType.NIPT_5,
    description: 'Package type (varies by test type)',
  })
  @IsString()
  packageType: string;

  @ApiProperty({
    enum: SampleType,
    example: SampleType.BIOPSY_TISSUE_FFPE,
    description: 'Sample type (required for gene mutation testing)',
    required: false,
  })
  @IsOptional()
  @IsEnum(SampleType)
  sampleType?: SampleType;
}

export class GenerateLabcodeResponseDto {
  @ApiProperty({
    example: 'N5AH941',
    description: 'Generated labcode',
  })
  labcode: string;

  @ApiProperty({
    example: 'N5A',
    description: 'Test code part of the labcode',
  })
  testCode: string;

  @ApiProperty({
    example: 'H',
    description: 'Random letter part of the labcode',
  })
  randomLetter: string;

  @ApiProperty({
    example: '941',
    description: 'Random number part of the labcode',
  })
  randomNumber: string;

  @ApiProperty({
    example: 'NIPT 5',
    description: 'Package type used for labcode generation',
    required: false,
  })
  packageType?: string;

  @ApiProperty({
    enum: SampleType,
    example: SampleType.BIOPSY_TISSUE_FFPE,
    description: 'Sample type used for labcode generation (if applicable)',
    required: false,
  })
  sampleType?: SampleType;

  @ApiProperty({
    example: 'Labcode generated successfully',
    description: 'Response message',
  })
  message: string;
}
