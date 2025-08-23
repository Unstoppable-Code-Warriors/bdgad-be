import {
  Controller,
  Get,
  Logger,
  Param,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { QueryNotificaiton } from './dto/query-notification.req.dto';
import {
  TypeNotification,
  TypeTaskNotification,
  SubTypeNotification,
} from 'src/utils/constant';
import { AuthGuard } from 'src/auth';
import { GetInitialNotificationsReqDto } from './dto/get-initial-notifications.req.dto';
import { GetInitialNotificationsResDto } from './dto/get-initial-notifications.res.dto';

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

  @Get('initial')
  @ApiOperation({
    summary: 'Get initial notifications for user when connecting to SSE',
    description:
      'Fetches the most recent notifications from DB for initial load',
  })
  @ApiQuery({
    name: 'userId',
    type: Number,
    required: true,
    description: 'ID of the user requesting notifications',
  })
  @ApiQuery({
    name: 'limit',
    type: Number,
    required: false,
    description:
      'Maximum number of notifications to fetch (default: 50, max: 100)',
    example: 50,
  })
  @ApiResponse({
    status: 200,
    description: 'Initial notifications retrieved successfully',
    type: GetInitialNotificationsResDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid parameters',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getInitialNotifications(@Query() query: GetInitialNotificationsReqDto) {
    this.logger.log(
      `Getting initial notifications for user ${query.userId}, limit: ${query.limit}`,
    );

    const notifications =
      await this.notificationService.getInitialNotifications(
        query.userId,
        query.limit,
      );

    const response: GetInitialNotificationsResDto = {
      notifications,
      totalCount: notifications.length,
      userId: query.userId,
      limit: query.limit || 50,
    };

    return response;
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
