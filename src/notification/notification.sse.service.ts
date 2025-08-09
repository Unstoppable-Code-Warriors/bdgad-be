import { Injectable, Logger } from '@nestjs/common';
import { interval, map, merge, Observable, Subject } from 'rxjs';

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

  private getOrCreateUserSubject(userId: number): Subject<SseMessage> {
    let subject = this.userStreams.get(userId);
    if (!subject) {
      subject = new Subject<SseMessage>();
      this.userStreams.set(userId, subject);
    }
    return subject;
  }

  subscribeToUser(userId: number): Observable<SseMessage> {
    const subject = this.getOrCreateUserSubject(userId);

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

    return merge(subject.asObservable(), heartbeat$);
  }

  emitNotificationCreated<T = unknown>(userId: number, payload: T): void {
    this.logger.log(`SSE emit notification_created to user ${userId}`);
    this.getOrCreateUserSubject(userId).next({
      event: 'notification_created',
      data: payload,
    });
  }

  emitNotificationUpdated<T = unknown>(userId: number, payload: T): void {
    this.logger.log(`SSE emit notification_updated to user ${userId}`);
    this.getOrCreateUserSubject(userId).next({
      event: 'notification_updated',
      data: payload,
    });
  }

  emitSystem<T = unknown>(payload: T): void {
    this.logger.log('SSE broadcast system_notification');
    for (const [, subject] of this.userStreams) {
      subject.next({ event: 'system_notification', data: payload });
    }
  }
}
