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
import {
  TypeTaskNotification,
  TypeNotification,
  SubTypeNotification,
} from 'src/utils/constant';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notifications)
    private readonly notificationRepository: Repository<Notifications>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private logger = new Logger(NotificationService.name);

  /**
   * Validate taskType parameter
   */
  private validateTaskType(taskType: string): boolean {
    const validTaskTypes = Object.values(TypeTaskNotification);
    return validTaskTypes.includes(taskType as TypeTaskNotification);
  }

  /**
   * Validate type parameter
   */
  private validateType(type: string): boolean {
    const validTypes = Object.values(TypeNotification);
    return validTypes.includes(type as TypeNotification);
  }

  /**
   * Validate subType parameter
   */
  private validateSubType(subType: string): boolean {
    const validSubTypes = Object.values(SubTypeNotification);
    return validSubTypes.includes(subType as SubTypeNotification);
  }

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

      // Validate taskType
      if (!this.validateTaskType(taskType)) {
        this.logger.warn(`Invalid taskType: ${taskType}`);
        return errorNotification.invalidTaskType;
      }

      // Validate type
      if (!this.validateType(type)) {
        this.logger.warn(`Invalid type: ${type}`);
        return errorNotification.invalidType;
      }

      // Validate subType
      if (!this.validateSubType(subType)) {
        this.logger.warn(`Invalid subType: ${subType}`);
        return errorNotification.invalidSubType;
      }

      // Validate receiverId is provided
      if (!receiverId) {
        this.logger.warn('Receiver ID is required');
        return errorUserAuthen.userNotFound;
      }

      // Validate receiver exists
      const receiver = await this.userRepository.findOne({
        where: { id: receiverId },
      });
      if (!receiver) {
        this.logger.warn(`Receiver with ID ${receiverId} not found`);
        return errorUserAuthen.userNotFound;
      }

      // Validate senderId is provided
      if (!senderId) {
        this.logger.warn('Sender ID is required');
        return errorUserAuthen.userNotFound;
      }

      // Validate sender exists
      const sender = await this.userRepository.findOne({
        where: { id: senderId },
      });
      if (!sender) {
        this.logger.warn(`Sender with ID ${senderId} not found`);
        return errorUserAuthen.userNotFound;
      }

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

      // Validate all notifications before creating
      for (let i = 0; i < notifications.length; i++) {
        const notif = notifications[i];

        // Validate taskType
        if (!this.validateTaskType(notif.taskType)) {
          this.logger.warn(
            `Invalid taskType in notification ${i}: ${notif.taskType}`,
          );
          return errorNotification.invalidTaskType;
        }

        // Validate type
        if (!this.validateType(notif.type)) {
          this.logger.warn(`Invalid type in notification ${i}: ${notif.type}`);
          return errorNotification.invalidType;
        }

        // Validate subType
        if (!this.validateSubType(notif.subType)) {
          this.logger.warn(
            `Invalid subType in notification ${i}: ${notif.subType}`,
          );
          return errorNotification.invalidSubType;
        }

        // Validate receiverId is provided
        if (!notif.receiverId) {
          this.logger.warn(`Receiver ID is required for notification ${i}`);
          return errorUserAuthen.userNotFound;
        }

        // Validate receiver exists
        const receiver = await this.userRepository.findOne({
          where: { id: notif.receiverId },
        });
        if (!receiver) {
          this.logger.warn(
            `Receiver with ID ${notif.receiverId} not found for notification ${i}`,
          );
          return errorUserAuthen.userNotFound;
        }

        // Validate senderId is provided
        if (!notif.senderId) {
          this.logger.warn(`Sender ID is required for notification ${i}`);
          return errorUserAuthen.userNotFound;
        }

        // Validate sender exists
        const sender = await this.userRepository.findOne({
          where: { id: notif.senderId },
        });
        if (!sender) {
          this.logger.warn(
            `Sender with ID ${notif.senderId} not found for notification ${i}`,
          );
          return errorUserAuthen.userNotFound;
        }
      }

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

      // Validate receiverId is provided
      if (!receiverId) {
        this.logger.warn('Receiver ID is required');
        return errorUserAuthen.userNotFound;
      }

      // Validate receiver exists
      const receiver = await this.userRepository.findOne({
        where: { id: receiverId },
      });
      if (!receiver) {
        this.logger.warn(`Receiver with ID ${receiverId} not found`);
        return errorUserAuthen.userNotFound;
      }

      // Validate taskType if provided
      if (taskType && !this.validateTaskType(taskType)) {
        this.logger.warn(`Invalid taskType: ${taskType}`);
        return errorNotification.invalidTaskType;
      }

      // Validate type if provided
      if (type && !this.validateType(type)) {
        this.logger.warn(`Invalid type: ${type}`);
        return errorNotification.invalidType;
      }

      // Validate subType if provided
      if (subType && !this.validateSubType(subType)) {
        this.logger.warn(`Invalid subType: ${subType}`);
        return errorNotification.invalidSubType;
      }

      // Validate sortOrder
      if (sortOrder && !['ASC', 'DESC'].includes(sortOrder)) {
        this.logger.warn(`Invalid sortOrder: ${sortOrder}`);
        return errorNotification.invalidType;
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
        queryBuilder.andWhere(':labcode = ANY(notification.labcode)', {
          labcode,
        });
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
