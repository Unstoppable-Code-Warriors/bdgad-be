import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString } from 'class-validator';
import { TypeNotification } from 'src/utils/constant';

export class CreateNotificationReqDto {
  @ApiProperty({ example: 'title' })
  @IsString()
  title: string;

  @IsString()
  @ApiProperty({ example: 'message' })
  message: string;

  @IsEnum(TypeNotification)
  @ApiProperty({ example: TypeNotification.SYSTEM, enum: TypeNotification })
  type: TypeNotification;

  @IsNumber()
  @ApiProperty({ example: 6 })
  senderId: number;

  @IsNumber()
  @ApiProperty({ example: 12 })
  receiverId: number;
}
