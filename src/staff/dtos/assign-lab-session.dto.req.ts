import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class AssignLabcodeItemDto {
  @IsString()
  labcode: string;

  @IsNumber()
  labTestingId: number;
}

export class AssignLabcodeDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignLabcodeItemDto)
  assignment: AssignLabcodeItemDto[];

  @IsNumber()
  doctorId: number;
}
