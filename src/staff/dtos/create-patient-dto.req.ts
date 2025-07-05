import { IsNotEmpty, IsString, MinLength } from "class-validator";
import { Transform } from "class-transformer";

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
  healthInsuranceCode: string;
}       