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
      const newNotification = await this.notificationRepository.save({
        ...createNotificationReqDto,
      });
      return newNotification;
    } catch (error) {
      this.logger.error('Failed to create notification', error);
      throw new InternalServerErrorException('Fail to create notification');
    }
  }

  async getNotifications(
    queryNotificationDto: QueryNotificaiton,
  ): Promise<Notifications[]> {
    const {
      receiverId,
      type,
      isRead,
      sortOrder = 'DESC',
    } = queryNotificationDto;

    const queryBuilder = this.notificationRepository
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.sender', 'sender')
      .leftJoinAndSelect('notification.receiver', 'receiver');

    if (receiverId !== undefined) {
      queryBuilder.andWhere('notification.receiverId = :receiverId', {
        receiverId,
      });
    }

    if (type !== undefined) {
      queryBuilder.andWhere('notification.type = :type', { type });
    }

    if (isRead !== undefined) {
      queryBuilder.andWhere('notification.isRead = :isRead', { isRead });
    }

    queryBuilder.orderBy('notification.createdAt', sortOrder);

    return await queryBuilder.getMany();
  }
}
