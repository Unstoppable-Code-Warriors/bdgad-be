import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TypeNotification } from 'src/utils/constant';

export class QueryNotificaiton {
  @IsOptional()
  receiverId: number;

  @IsOptional()
  @IsEnum(TypeNotification)
  @IsString()
  type: string;

  @IsOptional()
  isRead: boolean;

  @IsOptional()
  @IsString()
  sortOrder: 'ASC' | 'DESC';
}
