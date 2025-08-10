import { Transform } from 'class-transformer';
import { IsDate, IsOptional, IsString, IsObject } from 'class-validator';

export class UpdatePatientDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  fullName?: string;

  @IsOptional()
  @IsDate()
  @Transform(({ value }) => {
    if (!value) return undefined;
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  })
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
  medicalRecord?: Record<string, any>;

  @IsOptional()
  @IsObject()
  appointment?: Record<string, any>;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  personalId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  citizenId?: string;
}
