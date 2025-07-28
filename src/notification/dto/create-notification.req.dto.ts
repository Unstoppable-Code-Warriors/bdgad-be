import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsArray } from 'class-validator';
import {
  SubTypeNotification,
  TypeNotification,
  TypeTaskNotification,
} from 'src/utils/constant';

export class CreateNotificationReqDto {
  @ApiProperty({ example: 'title' })
  @IsString()
  title: string;

  @IsString()
  @ApiProperty({ example: 'message' })
  message: string;

  @IsEnum(TypeTaskNotification)
  @ApiProperty({ example: 'system', enum: TypeTaskNotification })
  taskType: TypeTaskNotification;

  @IsEnum(TypeNotification)
  @ApiProperty({ example: 'INFO', enum: TypeNotification })
  type: TypeNotification;

  @IsEnum(SubTypeNotification)
  @ApiProperty({ example: 'assign', enum: SubTypeNotification })
  subType: SubTypeNotification;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({ example: ['LAB001', 'LAB002'], required: false, type: [String] })
  labcode?: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'BAR001', required: false })
  barcode?: string;

  @IsNumber()
  @ApiProperty({ example: 6 })
  senderId: number;

  @IsNumber()
  @ApiProperty({ example: 12 })
  receiverId: number;
}
