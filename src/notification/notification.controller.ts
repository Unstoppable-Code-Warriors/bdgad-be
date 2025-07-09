import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { QueryNotificaiton } from './dto/query-notification.req.dto';
import { TypeNotification } from 'src/utils/constant';
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
  @UsePipes(new ValidationPipe({ transform: true }))
  getNotifications(@Query() query: QueryNotificaiton) {
    return this.notificationService.getNotifications(query);
  }

  //   @Post()
  //   @ApiOperation({ summary: 'Create notification' })
  //   @ApiBody({
  //     type: CreateNotificationReqDto,
  //     examples: {
  //       createNotificationReqDto: {
  //         title: 'title',
  //         message: 'message',
  //         type: TypeNotification.SYSTEM,
  //         senderId: 6,
  //         receiverId: 12,
  //       } as any,
  //     },
  //   })
  //   createNotification(
  //     @Body() createNotificationReqDto: CreateNotificationReqDto,
  //   ) {
  //     return this.notificationService.createNotification(
  //       createNotificationReqDto,
  //     );
  //   }
}
