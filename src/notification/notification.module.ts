import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notifications } from 'src/entities/notification.entity';
import { User } from 'src/entities/user.entity';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationSseService } from './notification.sse.service';
import { NotificationSseController } from './notification.sse.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notifications, User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [NotificationController, NotificationSseController],
  providers: [
    NotificationService,
    NotificationGateway,
    NotificationSseService,
    {
      provide: 'NOTIFICATION_GATEWAY_INIT',
      useFactory: (
        notificationService: NotificationService,
        notificationGateway: NotificationGateway,
      ) => {
        // Set up the gateway reference in the service
        notificationService.setGateway(notificationGateway);
        return true;
      },
      inject: [NotificationService, NotificationGateway],
    },
  ],
  exports: [NotificationService, NotificationGateway, NotificationSseService],
})
export class NotificationModule {}
