import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notifications } from 'src/entities/notification.entity';
import { User } from 'src/entities/user.entity';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

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
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationGateway,
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
  exports: [NotificationService, NotificationGateway],
})
export class NotificationModule {}
