import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { QueryNotificaiton } from './dto/query-notification.req.dto';
import { TypeNotification, TypeTaskNotification, SubTypeNotification } from 'src/utils/constant';
import { AuthGuard } from 'src/auth';
import { CreateNotificationReqDto } from './dto/create-notification.req.dto';
import { Transform } from 'class-transformer';

@ApiTags('Notification')
@UseGuards(AuthGuard)
@ApiSecurity('token')
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
    name: 'taskType',
    enum: [
      TypeTaskNotification.SYSTEM,
      TypeTaskNotification.LAB_TASK,
      TypeTaskNotification.ANALYSIS_TASK,
      TypeTaskNotification.VALIDATION_TASK,
    ],
    type: String,
    required: false,
  })
  @ApiQuery({
    name: 'type',
    enum: [
      TypeNotification.ACTION,
      TypeNotification.PROCESS,
      TypeNotification.INFO,
    ],
    type: String,
    required: false,
  })
  @ApiQuery({
    name: 'subType',
    enum: [
      SubTypeNotification.ACCEPT,
      SubTypeNotification.REJECT,
      SubTypeNotification.ASSIGN,
      SubTypeNotification.RESEND,
      SubTypeNotification.RETRY,
    ],
    type: String,
    required: false,
  })
  @ApiQuery({
    name: 'labcode',
    type: String,
    required: false,
  })
  @ApiQuery({
    name: 'barcode',
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
  @UsePipes(new ValidationPipe({ transform: true }))
  getNotifications(@Query() query: QueryNotificaiton) {
    return this.notificationService.getNotifications(query);
  }

  @Put(':notificationId')
  @ApiOperation({ summary: 'Update notification read status' })
  @ApiParam({
    name: 'notificationId',
    type: Number,
    description: 'ID of the notification to update',
  })
  async updateNotificationReadStatus(
    @Param('notificationId') notificationId: number,
  ) {
    const notification =
      await this.notificationService.updateNotificationReadStatus(
        notificationId,
      );
    return notification;
  }
}
