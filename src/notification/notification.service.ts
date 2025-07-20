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
import { CreateMultiNotificationReqDto } from './dto/create-notifications.req.dto';
import { errorNotification, errorUserAuthen } from 'src/utils/errorRespones';
import { User } from 'src/entities/user.entity';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notifications)
    private readonly notificationRepository: Repository<Notifications>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private logger = new Logger(NotificationService.name);

  async createNotification(createNotificationReqDto: CreateNotificationReqDto) {
    this.logger.log('Start create notification');
    try {
      const {
        title,
        message,
        taskType,
        type,
        subType,
        labcode,
        barcode,
        senderId,
        receiverId,
      } = createNotificationReqDto;

      const newNotification = await this.notificationRepository.create({
        title,
        message,
        taskType,
        type,
        subType,
        labcode,
        barcode,
        senderId,
        receiverId,
        isRead: false,
        createdAt: new Date(),
      });

      await this.notificationRepository.save(newNotification);
      return newNotification;
    } catch (error) {
      this.logger.error('Failed to create notification', error);
      throw new InternalServerErrorException('Failed to create notification');
    }
  }

  async createNotifications(
    createMultiNotificationReqDto: CreateMultiNotificationReqDto,
  ) {
    this.logger.log('Start batch create notifications');
    try {
      const { notifications } = createMultiNotificationReqDto;

      const newNotifications = notifications.map((notif) =>
        this.notificationRepository.create({
          ...notif,
          isRead: false,
          createdAt: new Date(),
        }),
      );

      const savedNotifications =
        await this.notificationRepository.save(newNotifications);

      return savedNotifications;
    } catch (error) {
      this.logger.error('Failed to batch create notifications', error);
      throw new InternalServerErrorException('Failed to create notifications');
    }
  }

  async getNotifications(queryNotificationDto: QueryNotificaiton) {
    try {
      const {
        receiverId,
        taskType,
        type,
        subType,
        labcode,
        barcode,
        isRead,
        sortOrder = 'DESC',
      } = queryNotificationDto;
      this.logger.log(
        `Log get notifications query - receiverId: ${receiverId}, taskType: ${taskType}, type: ${type}, subType: ${subType}, labcode: ${labcode}, barcode: ${barcode}, isRead: ${isRead}, sortOrder: ${sortOrder}`,
      );

      const receiver = this.userRepository.findOne({
        where: { id: receiverId },
      });
      if (!receiver) {
        this.logger.warn(`Receiver with ID ${receiverId} not found`);
        return errorUserAuthen.userNotFound;
      }

      const queryBuilder = this.notificationRepository
        .createQueryBuilder('notification')
        .leftJoinAndSelect('notification.sender', 'sender')
        .leftJoinAndSelect('notification.receiver', 'receiver')
        .select([
          'notification.id',
          'notification.title',
          'notification.message',
          'notification.taskType',
          'notification.type',
          'notification.subType',
          'notification.labcode',
          'notification.barcode',
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

      if (taskType) {
        queryBuilder.andWhere('notification.taskType = :taskType', {
          taskType,
        });
      }

      if (type) {
        queryBuilder.andWhere('notification.type = :type', { type });
      }

      if (subType) {
        queryBuilder.andWhere('notification.subType = :subType', { subType });
      }

      if (labcode) {
        queryBuilder.andWhere('notification.labcode = :labcode', { labcode });
      }

      if (barcode) {
        queryBuilder.andWhere('notification.barcode = :barcode', { barcode });
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

  async updateNotificationReadStatus(notificationId: number) {
    this.logger.log(
      `Start updating notification read status for ID: ${notificationId}`,
    );
    try {
      const notification = await this.notificationRepository.findOne({
        where: { id: notificationId },
      });

      if (!notification) {
        this.logger.warn(`Notification with ID ${notificationId} not found`);
        return errorNotification.notificationNotFound;
      }

      notification.isRead = true;
      await this.notificationRepository.save(notification);
      return notification;
    } catch (error) {
      this.logger.error('Failed to update notification read status', error);
      throw new InternalServerErrorException(
        'Fail to update notification read status',
      );
    }
  }
}
