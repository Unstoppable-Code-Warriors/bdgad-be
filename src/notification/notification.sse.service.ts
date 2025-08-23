import { Injectable, Logger } from '@nestjs/common';
import { interval, map, merge, Observable, Subject, timer } from 'rxjs';
import { finalize } from 'rxjs/operators';

export interface SseMessage<T = unknown> {
  data: T;
  event?: string;
  id?: string;
  retry?: number;
}

interface UserStreamInfo {
  subject: Subject<SseMessage>;
  lastActivity: Date;
  isActive: boolean;
}

@Injectable()
export class NotificationSseService {
  private readonly logger = new Logger(NotificationSseService.name);
  private readonly userStreams = new Map<number, UserStreamInfo>();
  private readonly notificationBuffer = new Map<number, SseMessage[]>();
  private readonly maxBufferSize = 10; // Keep last 10 notifications
  private readonly connectionTimeout = 60000; // 60 seconds timeout
  private readonly cleanupInterval = 30000; // Check every 30 seconds

  constructor() {
    // Start cleanup timer
    this.startCleanupTimer();
  }

  private startCleanupTimer(): void {
    timer(this.cleanupInterval, this.cleanupInterval).subscribe(() => {
      this.cleanupInactiveStreams();
    });
  }

  private cleanupInactiveStreams(): void {
    const now = new Date();
    const inactiveUsers: number[] = [];

    for (const [userId, streamInfo] of this.userStreams.entries()) {
      const timeSinceLastActivity =
        now.getTime() - streamInfo.lastActivity.getTime();

      if (timeSinceLastActivity > this.connectionTimeout) {
        inactiveUsers.push(userId);
        this.logger.log(
          `Marking user ${userId} as inactive (${timeSinceLastActivity}ms since last activity)`,
        );
      }
    }

    // Clean up inactive streams
    inactiveUsers.forEach((userId) => {
      this.cleanupUserStream(userId);
    });
  }

  private getOrCreateUserSubject(userId: number): UserStreamInfo {
    let streamInfo = this.userStreams.get(userId);
    if (!streamInfo) {
      const subject = new Subject<SseMessage>();
      streamInfo = {
        subject,
        lastActivity: new Date(),
        isActive: true,
      };
      this.userStreams.set(userId, streamInfo);
      this.logger.log(`Created new SSE stream for user ${userId}`);

      // Send buffered notifications when user connects
      const bufferedNotifications = this.notificationBuffer.get(userId);
      if (bufferedNotifications && bufferedNotifications.length > 0) {
        this.logger.log(
          `Sending ${bufferedNotifications.length} buffered notifications to user ${userId}`,
        );
        bufferedNotifications.forEach((notification) => {
          subject.next(notification);
        });
        // Clear buffer after sending
        this.notificationBuffer.delete(userId);
      }
    } else {
      // Update last activity
      streamInfo.lastActivity = new Date();
      streamInfo.isActive = true;
    }
    return streamInfo;
  }

  subscribeToUser(userId: number): Observable<SseMessage> {
    const streamInfo = this.getOrCreateUserSubject(userId);
    this.logger.log(
      `Creating SSE subscription for user ${userId}. Total active streams: ${this.userStreams.size}`,
    );

    // Heartbeat to keep Cloudflare/Nginx connection alive
    const heartbeat$ = interval(25000).pipe(
      map(
        () =>
          ({
            event: 'ping',
            data: { t: new Date().toISOString() },
          }) as SseMessage,
      ),
    );

    // Activity tracker - update last activity on each message
    const activityTracker$ = streamInfo.subject.asObservable().pipe(
      map((message) => {
        // Update last activity when user receives any message
        const userStream = this.userStreams.get(userId);
        if (userStream) {
          userStream.lastActivity = new Date();
        }
        return message;
      }),
    );

    // Merge heartbeat and user messages
    const userMessages$ = merge(activityTracker$, heartbeat$);

    return userMessages$.pipe(
      finalize(() => {
        // Only cleanup if the stream is actually closed
        const currentStream = this.userStreams.get(userId);
        if (currentStream && currentStream.subject.closed) {
          this.logger.log(`Stream closed for user ${userId}, cleaning up`);
          this.cleanupUserStream(userId);
        }
      }),
    );
  }

  private cleanupUserStream(userId: number): void {
    const streamInfo = this.userStreams.get(userId);
    if (streamInfo) {
      if (!streamInfo.subject.closed) {
        streamInfo.subject.complete();
      }
      this.userStreams.delete(userId);
      this.logger.log(
        `Cleaned up SSE stream for user ${userId}. Remaining streams: ${this.userStreams.size}`,
      );
    }
  }

  emitNotificationCreated<T = unknown>(userId: number, payload: T): void {
    const streamInfo = this.userStreams.get(userId);
    const streamExists = !!streamInfo && streamInfo.isActive;

    this.logger.log(
      `SSE emit notification_created to user ${userId}. Stream exists: ${streamExists}, Stream info: ${JSON.stringify(
        {
          hasStream: !!streamInfo,
          isActive: streamInfo?.isActive,
          lastActivity: streamInfo?.lastActivity?.toISOString(),
          subjectClosed: streamInfo?.subject.closed,
        },
      )}`,
    );

    if (streamExists && streamInfo) {
      // User is connected, emit directly
      streamInfo.lastActivity = new Date(); // Update activity
      streamInfo.subject.next({
        event: 'notification_created',
        data: payload,
      });
      this.logger.log(
        `SSE notification_created emitted successfully to user ${userId}`,
      );
    } else {
      // User not connected, buffer the notification
      const notification: SseMessage = {
        event: 'notification_created',
        data: payload,
      };

      let userBuffer = this.notificationBuffer.get(userId);
      if (!userBuffer) {
        userBuffer = [];
      }

      // Add to buffer and maintain max size
      userBuffer.push(notification);
      if (userBuffer.length > this.maxBufferSize) {
        userBuffer.shift(); // Remove oldest notification
      }

      this.notificationBuffer.set(userId, userBuffer);
      this.logger.log(
        `Notification buffered for user ${userId}. Buffer size: ${userBuffer.length}`,
      );
    }
  }

  emitNotificationUpdated<T = unknown>(userId: number, payload: T): void {
    const streamInfo = this.userStreams.get(userId);
    const streamExists = !!streamInfo && streamInfo.isActive;

    this.logger.log(
      `SSE emit notification_updated to user ${userId}. Stream exists: ${streamExists}`,
    );

    if (streamExists && streamInfo) {
      // User is connected, emit directly
      streamInfo.lastActivity = new Date(); // Update activity
      streamInfo.subject.next({
        event: 'notification_updated',
        data: payload,
      });
      this.logger.log(
        `SSE notification_updated emitted successfully to user ${userId}`,
      );
    } else {
      // User not connected, buffer the notification
      const notification: SseMessage = {
        event: 'notification_updated',
        data: payload,
      };

      let userBuffer = this.notificationBuffer.get(userId);
      if (!userBuffer) {
        userBuffer = [];
      }

      // Add to buffer and maintain max size
      userBuffer.push(notification);
      if (userBuffer.length > this.maxBufferSize) {
        userBuffer.shift(); // Remove oldest notification
      }

      this.notificationBuffer.set(userId, userBuffer);
      this.logger.log(
        `Notification buffered for user ${userId}. Buffer size: ${userBuffer.length}`,
      );
    }
  }

  emitSystem<T = unknown>(payload: T): void {
    this.logger.log(
      `SSE broadcast system_notification to ${this.userStreams.size} active streams`,
    );
    for (const [userId, streamInfo] of this.userStreams) {
      if (streamInfo.isActive) {
        streamInfo.lastActivity = new Date();
        streamInfo.subject.next({
          event: 'system_notification',
          data: payload,
        });
        this.logger.log(`SSE system_notification sent to user ${userId}`);
      }
    }
  }

  // Method to get active streams count for monitoring
  getActiveStreamsCount(): number {
    return Array.from(this.userStreams.values()).filter(
      (stream) => stream.isActive,
    ).length;
  }

  // Method to get list of active user IDs for debugging
  getActiveUserIds(): number[] {
    return Array.from(this.userStreams.entries())
      .filter(([, stream]) => stream.isActive)
      .map(([userId]) => userId);
  }

  // Method to get detailed stream info for debugging
  getStreamInfo(userId: number): UserStreamInfo | null {
    return this.userStreams.get(userId) || null;
  }

  // Method to manually mark user as active (for testing/debugging)
  markUserActive(userId: number): void {
    const streamInfo = this.userStreams.get(userId);
    if (streamInfo) {
      streamInfo.isActive = true;
      streamInfo.lastActivity = new Date();
      this.logger.log(`Manually marked user ${userId} as active`);
    }
  }
}
