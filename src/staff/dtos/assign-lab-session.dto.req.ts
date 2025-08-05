import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';

class AssignLabcodeItemDto {
  @IsString()
  labcode: string;

  @IsNumber()
  labTestingId: number;
}

export class AssignLabcodeDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignLabcodeItemDto)
  assignment: AssignLabcodeItemDto[];

  @IsNumber()
  doctorId: number;
}
