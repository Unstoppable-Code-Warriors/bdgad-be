import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Notifications } from 'src/entities/notification.entity';
import { Repository } from 'typeorm';
import { CreateNotificationReqDto } from './dto/create-notification.req.dto';
import { QueryNotificaiton } from './dto/query-notification.req.dto';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notifications)
    private readonly notificationRepository: Repository<Notifications>,
  ) {}

  private logger = new Logger(NotificationService.name);

  async createNotification(createNotificationReqDto: CreateNotificationReqDto) {
    this.logger.log('Start create notification');
    try {
      const { title, message, type, senderId, receiverId } =
        createNotificationReqDto;
      const newNotification = await this.notificationRepository.create({
        title,
        message,
        type,
        senderId,
        receiverId,
      });

      await this.notificationRepository.save(newNotification);
      return newNotification;
    } catch (error) {
      this.logger.error('Failed to create notification', error);
      throw new InternalServerErrorException('Fail to create notification');
    }
  }

  async getNotifications(
    queryNotificationDto: QueryNotificaiton,
  ): Promise<Notifications[]> {
    try {
      const {
        receiverId,
        type,
        isRead,
        sortOrder = 'DESC',
      } = queryNotificationDto;
      this.logger.log(
        `Log get notifications query - receiverId: ${receiverId}, type: ${type}, isRead: ${isRead}, sortOrder: ${sortOrder}`,
      );

      const queryBuilder = this.notificationRepository
        .createQueryBuilder('notification')
        .leftJoinAndSelect('notification.sender', 'sender')
        .leftJoinAndSelect('notification.receiver', 'receiver')
        .select([
          'notification.id',
          'notification.title',
          'notification.message',
          'notification.type',
          'sender.id',
          'sender.name',
          'sender.email',
          'receiver.id',
          'receiver.name',
          'receiver.email',
          'notification.isRead',
          'notification.createdAt',
        ]);

      if (receiverId) {
        queryBuilder.andWhere('notification.receiverId = :receiverId', {
          receiverId,
        });
      }

      if (type) {
        queryBuilder.andWhere('notification.type = :type', { type });
      }

      if (isRead) {
        queryBuilder.andWhere('notification.isRead = :isRead', { isRead });
      }

      queryBuilder.orderBy('notification.createdAt', sortOrder);

      const notifications = await queryBuilder.getMany();
      return notifications;
    } catch (error) {
      this.logger.error('Failed to get notifications', error);
      throw new InternalServerErrorException('Fail to get notifications');
    }
  }
}
