import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface AuthenticatedSocket extends Socket {
  userId?: number;
  userEmail?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(
          `Client ${client.id} connection rejected: No token provided`,
        );
        client.disconnect();
        return;
      }

      // Verify JWT token
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      if (!payload || !payload.sub) {
        this.logger.warn(
          `Client ${client.id} connection rejected: Invalid token`,
        );
        client.disconnect();
        return;
      }

      // Store user info in socket
      client.userId = payload.sub;
      client.userEmail = payload.email;

      // Join user to their personal notification room
      const userRoom = `user_${client.userId}`;
      await client.join(userRoom);

      this.logger.log(
        `Client ${client.id} connected - User: ${client.userEmail} (ID: ${client.userId})`,
      );
      this.logger.log(`Client joined room: ${userRoom}`);

      // Send connection confirmation
      client.emit('connection_confirmed', {
        message: 'Successfully connected to notification service',
        userId: client.userId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Authentication failed for client ${client.id}:`,
        error.message,
      );
      client.emit('auth_error', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(
      `Client ${client.id} disconnected - User: ${client.userEmail} (ID: ${client.userId})`,
    );
  }

  @SubscribeMessage('join_notification_room')
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { userId: number },
  ) {
    if (!client.userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    // Only allow users to join their own room
    if (client.userId !== data.userId) {
      client.emit('error', { message: 'Unauthorized room access' });
      return;
    }

    const userRoom = `user_${data.userId}`;
    await client.join(userRoom);

    this.logger.log(`Client ${client.id} joined room: ${userRoom}`);
    client.emit('room_joined', { room: userRoom });
  }

  @SubscribeMessage('leave_notification_room')
  async handleLeaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { userId: number },
  ) {
    if (!client.userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    const userRoom = `user_${data.userId}`;
    await client.leave(userRoom);

    this.logger.log(`Client ${client.id} left room: ${userRoom}`);
    client.emit('room_left', { room: userRoom });
  }

  // Method to emit new notification to specific user
  emitNotificationToUser(userId: number, notification: any) {
    const userRoom = `user_${userId}`;
    this.logger.log(`Emitting new notification to room: ${userRoom}`);

    this.server.to(userRoom).emit('notification_created', {
      type: 'notification_created',
      data: notification,
      timestamp: new Date().toISOString(),
    });
  }

  // Method to emit notification update to specific user
  emitNotificationUpdateToUser(userId: number, notification: any) {
    const userRoom = `user_${userId}`;
    this.logger.log(`Emitting notification update to room: ${userRoom}`);

    this.server.to(userRoom).emit('notification_updated', {
      type: 'notification_updated',
      data: notification,
      timestamp: new Date().toISOString(),
    });
  }

  // Method to broadcast system notification to all connected users
  broadcastSystemNotification(notification: any) {
    this.logger.log('Broadcasting system notification to all users');

    this.server.emit('system_notification', {
      type: 'system_notification',
      data: notification,
      timestamp: new Date().toISOString(),
    });
  }
}
