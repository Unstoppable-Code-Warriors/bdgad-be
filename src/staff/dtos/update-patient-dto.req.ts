import { Transform } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';

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
  address?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  personalId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  citizenId?: string;
}
