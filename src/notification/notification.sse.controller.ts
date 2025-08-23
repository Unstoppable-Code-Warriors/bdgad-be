import {
  Controller,
  Get,
  Logger,
  ParseIntPipe,
  Query,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { NotificationSseService, SseMessage } from './notification.sse.service';

@Controller('notification')
export class NotificationSseController {
  private readonly logger = new Logger(NotificationSseController.name);
  constructor(private readonly sseService: NotificationSseService) {}

  // Example: GET /api/v1/notification/stream?userId=123
  @Get('stream')
  @Sse()
  stream(
    @Query('userId', ParseIntPipe) userId: number,
  ): Observable<SseMessage> {
    this.logger.log(`SSE stream subscribed for user ${userId}`);
    return this.sseService.subscribeToUser(userId);
  }

  // Debug endpoint: GET /api/v1/notification/sse-debug
  @Get('sse-debug')
  getSseDebugInfo() {
    return {
      activeStreamsCount: this.sseService.getActiveStreamsCount(),
      activeUserIds: this.sseService.getActiveUserIds(),
      timestamp: new Date().toISOString(),
    };
  }
}
