import {
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
  IsObject,
  IsDateString,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePatientDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @Transform(({ value }) => value?.trim())
  fullName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @Transform(({ value }) => value?.trim())
  citizenId: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: Date;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  ethnicity?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  address1?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  address2?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  gender?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  nation?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  workAddress?: string;

  @IsOptional()
  @IsObject()
  allergiesInfo?: Record<string, any>;

  @IsOptional()
  @IsObject()
  appointment?: Record<string, any>;
}
