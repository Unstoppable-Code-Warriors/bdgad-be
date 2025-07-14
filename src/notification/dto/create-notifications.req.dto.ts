// create-multi-notification.req.dto.ts
import { CreateNotificationReqDto } from './create-notification.req.dto';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMultiNotificationReqDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateNotificationReqDto)
  notifications: CreateNotificationReqDto[];
}
