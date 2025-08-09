import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayNotEmpty, IsNumber } from 'class-validator';

export class SendGeneralFileToEMRDto {
  @ApiProperty({
    description: 'Array of category general file IDs to send to EMR',
    example: [1, 6],
    type: [Number],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsNumber({}, { each: true })
  categoryGeneralFileIds: number[];
}
