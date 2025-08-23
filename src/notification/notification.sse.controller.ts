import {
  Controller,
  Get,
  Logger,
  ParseIntPipe,
  Query,
  Sse,
  Param,
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
    this.logger.log(
      `🔗 SSE stream subscribed for user ${userId} - Starting subscription...`,
    );

    // Log current streams before subscription
    const currentStreams = this.sseService.getActiveStreamsCount();
    const currentUserIds = this.sseService.getActiveUserIds();
    this.logger.log(
      `📊 Current SSE state - Active streams: ${currentStreams}, User IDs: [${currentUserIds.join(', ')}]`,
    );

    const subscription = this.sseService.subscribeToUser(userId);

    // Log after subscription
    setTimeout(() => {
      const newStreams = this.sseService.getActiveStreamsCount();
      const newUserIds = this.sseService.getActiveUserIds();
      this.logger.log(
        `📊 After subscription - Active streams: ${newStreams}, User IDs: [${newUserIds.join(', ')}]`,
      );

      // Check if user 52 is in the streams
      if (userId === 52) {
        const userStreamInfo = this.sseService.getStreamInfo(52);
        this.logger.log(`🔍 User 52 stream info:`, {
          hasStream: !!userStreamInfo,
          isActive: userStreamInfo?.isActive,
          lastActivity: userStreamInfo?.lastActivity?.toISOString(),
          subjectClosed: userStreamInfo?.subject.closed,
        });
      }
    }, 100);

    return subscription;
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

  // Detailed debug endpoint: GET /api/v1/notification/sse-debug/:userId
  @Get('sse-debug/:userId')
  getSseUserDebugInfo(@Param('userId', ParseIntPipe) userId: number) {
    const streamInfo = this.sseService.getStreamInfo(userId);
    return {
      userId,
      hasStream: !!streamInfo,
      streamInfo: streamInfo
        ? {
            isActive: streamInfo.isActive,
            lastActivity: streamInfo.lastActivity?.toISOString(),
            subjectClosed: streamInfo.subject.closed,
            subjectHasObservers: streamInfo.subject.observed,
          }
        : null,
      timestamp: new Date().toISOString(),
    };
  }

  // Manual activation endpoint: POST /api/v1/notification/sse-activate/:userId
  @Get('sse-activate/:userId')
  activateUserStream(@Param('userId', ParseIntPipe) userId: number) {
    this.sseService.markUserActive(userId);
    return {
      message: `User ${userId} stream marked as active`,
      timestamp: new Date().toISOString(),
    };
  }
}
