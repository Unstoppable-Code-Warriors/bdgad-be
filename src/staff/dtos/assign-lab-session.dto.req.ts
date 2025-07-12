import { IsNumber, IsOptional, IsString } from 'class-validator';

export class AssignLabSessionDto {
  @IsNumber()
  doctorId: number;

  @IsOptional()
  @IsNumber()
  labTestingId?: number;
}
