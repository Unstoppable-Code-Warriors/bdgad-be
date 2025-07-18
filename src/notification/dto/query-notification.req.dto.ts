import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  TypeNotification,
  TypeTaskNotification,
  SubTypeNotification,
} from 'src/utils/constant';

export class QueryNotificaiton {
  @IsOptional()
  receiverId: number;

  @IsOptional()
  @IsEnum(TypeTaskNotification)
  @IsString()
  taskType: string;

  @IsOptional()
  @IsEnum(TypeNotification)
  @IsString()
  type: string;

  @IsOptional()
  @IsEnum(SubTypeNotification)
  @IsString()
  subType: string;

  @IsOptional()
  @IsString()
  labcode: string;

  @IsOptional()
  @IsString()
  barcode: string;

  @IsOptional()
  isRead: boolean;

  @IsOptional()
  @IsString()
  sortOrder: 'ASC' | 'DESC';
}
