import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class RejectFastqDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500, { message: 'Redo reason must not exceed 500 characters' })
  redoReason: string;
}
