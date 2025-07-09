import { Controller, Get, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { QueryNotificaiton } from './dto/query-notification.req.dto';
import { TypeNotification } from 'src/utils/constant';

@ApiTags('notification')
@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}
  private readonly logger = new Logger(NotificationController.name);
  @Get()
  @ApiOperation({ summary: 'Get all notifications by query' })
  @ApiQuery({
    name: 'receiverId',
    type: Number,
    required: false,
  })
  @ApiQuery({
    name: 'type',
    enum: [
      TypeNotification.SYSTEM,
      TypeNotification.LAB_TASK,
      TypeNotification.ANALYSIS_TASK,
      TypeNotification.VALIDATION_TASK,
    ],
    type: String,
    required: false,
  })
  @ApiQuery({
    name: 'isRead',
    type: Boolean,
    required: false,
  })
  @ApiQuery({
    name: 'sortOrder',
    enum: ['ASC', 'DESC'],
    type: String,
    required: false,
  })
  getNotifications(@Query() query: QueryNotificaiton) {
    return this.notificationService.getNotifications(query);
  }
}
