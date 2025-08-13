import { IsNotEmpty, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignResultTestDto {
  @ApiProperty({
    description: 'ID of the doctor to assign to the result test',
    example: 1,
  })
  @IsNotEmpty()
  @IsNumber()
  doctorId: number;

  @ApiProperty({
    description: 'ID of the labcode lab session',
    example: 1,
  })
  @IsNotEmpty()
  @IsNumber()
  labcodeLabSessionId: number;
}
