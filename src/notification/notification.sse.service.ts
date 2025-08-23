import { Injectable, Logger } from '@nestjs/common';
import { interval, map, merge, Observable, Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';

export interface SseMessage<T = unknown> {
  data: T;
  event?: string;
  id?: string;
  retry?: number;
}

@Injectable()
export class NotificationSseService {
  private readonly logger = new Logger(NotificationSseService.name);
  private readonly userStreams = new Map<number, Subject<SseMessage>>();
  private readonly notificationBuffer = new Map<number, SseMessage[]>();
  private readonly maxBufferSize = 10; // Keep last 10 notifications

  private getOrCreateUserSubject(userId: number): Subject<SseMessage> {
    let subject = this.userStreams.get(userId);
    if (!subject) {
      subject = new Subject<SseMessage>();
      this.userStreams.set(userId, subject);
      this.logger.log(`Created new SSE stream for user ${userId}`);

      // Send buffered notifications when user connects
      const bufferedNotifications = this.notificationBuffer.get(userId);
      if (bufferedNotifications && bufferedNotifications.length > 0) {
        this.logger.log(
          `Sending ${bufferedNotifications.length} buffered notifications to user ${userId}`,
        );
        bufferedNotifications.forEach((notification) => {
          if (subject) {
            subject.next(notification);
          }
        });
        // Clear buffer after sending
        this.notificationBuffer.delete(userId);
      }
    }
    return subject;
  }

  subscribeToUser(userId: number): Observable<SseMessage> {
    const subject = this.getOrCreateUserSubject(userId);
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

    return merge(subject.asObservable(), heartbeat$).pipe(
      finalize(() => {
        // Cleanup when client disconnects
        this.cleanupUserStream(userId);
      }),
    );
  }

  private cleanupUserStream(userId: number): void {
    const subject = this.userStreams.get(userId);
    if (subject) {
      if (!subject.closed) {
        subject.complete();
      }
      this.userStreams.delete(userId);
      this.logger.log(
        `Cleaned up SSE stream for user ${userId}. Remaining streams: ${this.userStreams.size}`,
      );
    }
  }

  emitNotificationCreated<T = unknown>(userId: number, payload: T): void {
    const streamExists = this.userStreams.has(userId);
    this.logger.log(
      `SSE emit notification_created to user ${userId}. Stream exists: ${streamExists}`,
    );

    if (streamExists) {
      // User is connected, emit directly
      const subject = this.userStreams.get(userId);
      if (subject) {
        subject.next({
          event: 'notification_created',
          data: payload,
        });
        this.logger.log(
          `SSE notification_created emitted successfully to user ${userId}`,
        );
      }
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
    const streamExists = this.userStreams.has(userId);
    this.logger.log(
      `SSE emit notification_updated to user ${userId}. Stream exists: ${streamExists}`,
    );

    if (streamExists) {
      // User is connected, emit directly
      const subject = this.userStreams.get(userId);
      if (subject) {
        subject.next({
          event: 'notification_updated',
          data: payload,
        });
        this.logger.log(
          `SSE notification_updated emitted successfully to user ${userId}`,
        );
      }
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
    for (const [userId, subject] of this.userStreams) {
      subject.next({ event: 'system_notification', data: payload });
      this.logger.log(`SSE system_notification sent to user ${userId}`);
    }
  }

  // Method to get active streams count for monitoring
  getActiveStreamsCount(): number {
    return this.userStreams.size;
  }

  // Method to get list of active user IDs for debugging
  getActiveUserIds(): number[] {
    return Array.from(this.userStreams.keys());
  }
}
