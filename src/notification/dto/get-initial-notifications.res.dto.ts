import { ApiProperty } from '@nestjs/swagger';
import { Notifications } from 'src/entities/notification.entity';

export class GetInitialNotificationsResDto {
  @ApiProperty({
    description: 'List of initial notifications',
    type: [Notifications],
  })
  notifications: Notifications[];

  @ApiProperty({
    description: 'Total count of notifications fetched',
    example: 25,
  })
  totalCount: number;

  @ApiProperty({
    description: 'User ID who requested the notifications',
    example: 123,
  })
  userId: number;

  @ApiProperty({
    description: 'Limit used for the request',
    example: 50,
  })
  limit: number;
}
